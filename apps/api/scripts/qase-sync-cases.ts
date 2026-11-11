/**
 * Creates and updates the Qase TestOps cases described by the catalogue in
 * src/test-support/qase/, then writes the numeric case IDs back into
 * src/test-support/qase-case-ids.ts so the suites can link their results.
 *
 * Every case is written in full - description, preconditions, steps, tags, type
 * and behavior - so TestOps is readable without the repository. A case is
 * identified by its `order-desk:<key>` tag, which lets the sync rename or move
 * it in place instead of creating a replacement, and it is only patched when
 * something differs, which keeps the run idempotent and the API traffic low.
 *
 * When a key leaves the catalogue, its case is not deleted: because the TestOps
 * API has no case archive, the case is moved under `Archive / <original top
 * level suite>` with its tags and results intact, and a returning key brings it
 * back to the manifest suite with the same ID.
 *
 * Usage:
 *   pnpm --filter @order-desk/api qase:sync --dry-run   # read-only plan
 *   pnpm --filter @order-desk/api qase:sync             # apply
 *
 * Credentials: QASE_TESTOPS_API_TOKEN from the repository-root .env. The project
 * code and API host default to apps/api/qase.config.json and can be overridden
 * with QASE_TESTOPS_PROJECT / QASE_TESTOPS_API_HOST.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { qaseCases, type QaseCase } from "../src/test-support/qase-manifest.ts";
import { qcUsageIndex } from "../src/test-support/qase/spec-index.ts";
import {
  caseTagPrefix,
  planArchives,
  planMatches,
  type PlannedCase,
  type RemoteCase,
  suitePathOf,
  type SuiteRef,
} from "../src/test-support/qase/sync-plan.ts";

const repoRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const apiDir = resolve(repoRoot, "apps/api");
const idsPath = resolve(apiDir, "src/test-support/qase-case-ids.ts");

loadEnv({ path: resolve(repoRoot, ".env"), quiet: true });

interface QaseConfigFile {
  testops?: { project?: string; api?: { host?: string } };
}

const fileConfig = JSON.parse(readFileSync(resolve(apiDir, "qase.config.json"), "utf8")) as QaseConfigFile;

const token = process.env.QASE_TESTOPS_API_TOKEN?.trim();
const project = (process.env.QASE_TESTOPS_PROJECT ?? fileConfig.testops?.project ?? "").trim();
const host = (process.env.QASE_TESTOPS_API_HOST ?? fileConfig.testops?.api?.host ?? "qase.io").trim();
const dryRun = process.argv.includes("--dry-run") || process.env.QASE_SYNC_DRY_RUN === "1";

if (!token) {
  throw new Error("QASE_TESTOPS_API_TOKEN is missing: add it to .env or export it before syncing.");
}

if (!project) {
  throw new Error(
    "No Qase project code: set testops.project in apps/api/qase.config.json or QASE_TESTOPS_PROJECT.",
  );
}

const baseUrl = resolveBaseUrl(host);

/*
 * Field codes of the TestOps API. The API documents the accepted ranges but not
 * their meaning, so the order below follows the TestOps UI: the ids were
 * verified against a live project (`type` 1-11, `behavior` 1-3, `status` 0-2).
 */
const severityIds = { blocker: 1, critical: 2, major: 3, normal: 4, minor: 5, trivial: 6 } as const;
const priorityIds = { high: 1, medium: 2, low: 3 } as const;
const layerIds = { e2e: 1, api: 2, unit: 3 } as const;
const typeIds = {
  functional: 1,
  smoke: 2,
  regression: 3,
  security: 4,
  performance: 5,
  acceptance: 6,
  usability: 7,
  compatibility: 8,
  integration: 9,
  exploratory: 10,
  other: 11,
} as const;
const behaviorIds = { positive: 1, negative: 2, destructive: 3 } as const;

interface QaseSuiteResponse {
  id: number;
  title: string;
  parent_id?: number | null;
}

interface QaseStepEntity {
  action?: string | null;
  expected_result?: string | null;
  data?: string | null;
}

interface QaseCaseEntity {
  id: number;
  title: string;
  suite_id?: number | null;
  severity?: number | null;
  priority?: number | null;
  layer?: number | null;
  type?: number | null;
  behavior?: number | null;
  description?: string | null;
  preconditions?: string | null;
  postconditions?: string | null;
  steps_type?: string | null;
  steps?: QaseStepEntity[] | null;
  /** Reads return tag objects, writes take plain strings. */
  tags?: Array<string | { title?: string | null }> | null;
  /** The API spells the automation flag in camelCase, unlike the rest of the payload. */
  isManual?: boolean | null;
}

interface QaseList<T> {
  result: { total?: number; count?: number; entities?: T[] };
}

interface QaseCreated {
  result: { id: number };
}

interface CaseStepPayload {
  action: string;
  expected_result: string;
  data?: string;
}

interface CasePayload {
  title: string;
  suite_id: number;
  severity: number;
  priority: number;
  layer: number;
  type: number;
  behavior: number;
  /** Create and update endpoints expect `isManual` as 0 (automated) or 1 (manual). */
  isManual: 0 | 1;
  description: string;
  preconditions?: string;
  postconditions?: string;
  steps_type: "classic";
  steps: CaseStepPayload[];
  tags: string[];
}

const suites: SuiteRef[] = (await listAll<QaseSuiteResponse>(`suite/${project}`)).map((suite) => ({
  id: suite.id,
  title: suite.title,
  parentId: suite.parent_id ?? null,
}));
const storedCases = await listAll<QaseCaseEntity>(`case/${project}`);
const specUsage = qcUsageIndex();
const createdSuites: string[] = [];
const createdCases: string[] = [];
const updatedCases: string[] = [];
const archivedCases: string[] = [];
const resolvedIds = new Map<string, number>();
const casesByKey = new Map<string, QaseCase>(qaseCases.map((entry) => [entry.key, entry]));

const plannedCases: PlannedCase[] = [];

for (const qaseCase of qaseCases) {
  plannedCases.push({
    key: qaseCase.key,
    title: qaseCase.title,
    suiteId: await ensureSuite(qaseCase.suite),
  });
}

const remoteCases: RemoteCase[] = storedCases.map((entity) => ({
  id: entity.id,
  title: entity.title,
  suiteId: entity.suite_id ?? null,
  tags: tagsOf(entity.tags),
}));

const plan = planMatches(plannedCases, remoteCases);

if (plan.conflicts.length > 0) {
  throw new Error(
    "Two or more Qase cases carry the same catalogue tag, so the sync cannot tell which one to update:\n" +
      plan.conflicts.map(({ key, ids }) => `  ${key}: #${ids.join(", #")}`).join("\n") +
      "\nDelete the duplicate case or its tag in TestOps, then run the sync again.",
  );
}

const storedById = new Map(storedCases.map((entity) => [entity.id, entity]));

for (const match of plan.matches) {
  const qaseCase = mustCase(match.planned.key);
  const payload = toPayload(qaseCase, match.planned.suiteId, specUsage.get(qaseCase.key) ?? []);
  const stored = storedById.get(match.remote.id);

  if (stored === undefined) {
    throw new Error(`Qase case #${match.remote.id} disappeared while syncing "${qaseCase.key}".`);
  }

  resolvedIds.set(qaseCase.key, stored.id);

  if (!(await isDrifted(stored, payload))) {
    continue;
  }

  const reason = updateReason(qaseCase.key, stored, payload);

  if (dryRun) {
    updatedCases.push(`${qaseCase.key} (${reason})`);
    continue;
  }

  await request<QaseCreated>("PATCH", `case/${project}/${stored.id}`, payload);
  Object.assign(stored, payload);
  updatedCases.push(qaseCase.key);
}

for (const entry of plan.missing) {
  const qaseCase = mustCase(entry.key);

  if (dryRun) {
    createdCases.push(`${entry.key} (new case in "${qaseCase.suite.join(" / ")}")`);
    continue;
  }

  const payload = toPayload(qaseCase, entry.suiteId, specUsage.get(qaseCase.key) ?? []);
  const created = await request<QaseCreated>("POST", `case/${project}`, payload);
  resolvedIds.set(qaseCase.key, created.result.id);
  createdCases.push(qaseCase.key);
}

for (const move of planArchives(new Set(casesByKey.keys()), remoteCases, suites)) {
  const from = move.from.join(" / ") || "no suite";
  const note = `${move.key} (#${move.id} from "${from}" to "${move.to.join(" / ")}")`;
  // Resolved before the dry-run branch so the plan also reports the archive suites it would create.
  const suiteId = await ensureSuite(move.to);

  if (dryRun) {
    archivedCases.push(note);
    continue;
  }

  await request<QaseCreated>("PATCH", `case/${project}/${move.id}`, { suite_id: suiteId });
  archivedCases.push(note);
}

if (!dryRun) {
  writeIds(resolvedIds);
}

report();

function mustCase(key: string): QaseCase {
  const entry = casesByKey.get(key);

  if (entry === undefined) {
    throw new Error(`Catalogue key "${key}" vanished from the manifest while syncing.`);
  }

  return entry;
}

/** Explains an update in the dry-run report: renames and moves are the interesting ones. */
function updateReason(key: string, stored: QaseCaseEntity, payload: CasePayload): string {
  const notes: string[] = [];

  if (stored.title !== payload.title) notes.push(`renamed from "${stored.title}"`);
  if ((stored.suite_id ?? null) !== payload.suite_id) {
    const from = suitePathOf(suites, stored.suite_id ?? null).join(" / ");
    notes.push(`moved from "${from || "no suite"}"`);
  }

  return notes.length === 0 ? "content drifted" : notes.join(", ");
}

async function ensureSuite(path: readonly string[]): Promise<number> {
  let parentId: number | null = null;

  for (const [index, title] of path.entries()) {
    const currentPath = path.slice(0, index + 1).join(" / ");
    const existing = suites.find(
      (suite) => suite.title === title && suite.parentId === parentId,
    );

    if (existing) {
      parentId = existing.id;
      continue;
    }

    if (dryRun) {
      if (!createdSuites.includes(currentPath)) createdSuites.push(currentPath);
      return -1;
    }

    const created = await request<QaseCreated>("POST", `suite/${project}`, {
      title,
      ...(parentId === null ? {} : { parent_id: parentId }),
    });
    suites.push({ id: created.result.id, title, parentId });
    createdSuites.push(currentPath);
    parentId = created.result.id;
  }

  if (parentId === null) {
    throw new Error(`Suite path "${path.join(" / ")}" did not resolve to a suite ID.`);
  }

  return parentId;
}

function toPayload(qaseCase: QaseCase, suiteId: number, specPaths: readonly string[]): CasePayload {
  return {
    title: qaseCase.title,
    suite_id: suiteId,
    severity: severityIds[qaseCase.severity],
    priority: priorityIds[qaseCase.priority],
    layer: layerIds[qaseCase.layer],
    type: typeIds[qaseCase.type ?? "functional"],
    behavior: behaviorIds[qaseCase.behavior ?? "positive"],
    isManual: 0,
    description: describe(qaseCase, specPaths),
    ...(qaseCase.preconditions === undefined ? {} : { preconditions: qaseCase.preconditions }),
    ...(qaseCase.postconditions === undefined ? {} : { postconditions: qaseCase.postconditions }),
    steps_type: "classic",
    steps: qaseCase.steps.map((step) => ({
      action: step.action,
      expected_result: step.expected,
      ...(step.data === undefined ? {} : { data: step.data }),
    })),
    tags: tagsFor(qaseCase),
  };
}

/** The owning spec is derived, so a moved test file updates its case on the next sync. */
function describe(qaseCase: QaseCase, specPaths: readonly string[]): string {
  const credit =
    specPaths.length === 0
      ? "_Automation: no spec references this key yet._"
      : `_Automated by ${specPaths.map((path) => `\`${path}\``).join(", ")}._`;

  return `${qaseCase.description.trim()}\n\n${credit}`;
}

function tagsFor(qaseCase: QaseCase): string[] {
  return [`${caseTagPrefix}${qaseCase.key}`, qaseCase.layer, ...qaseCase.suite.map(slugTag)];
}

function slugTag(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Decides whether a stored case still matches the manifest.
 *
 * The list endpoint already reports the content, but it may shorten long step
 * lists, so a difference seen there is confirmed against the case detail before
 * anything is patched. That keeps repeated syncs free of spurious updates.
 */
async function isDrifted(existing: QaseCaseEntity, payload: CasePayload): Promise<boolean> {
  if (!matchesMetadata(existing, payload)) return true;
  if (matchesContent(existing, payload)) return false;

  const detail = await request<{ result: QaseCaseEntity }>("GET", `case/${project}/${existing.id}`);

  return !matchesMetadata(detail.result, payload) || !matchesContent(detail.result, payload);
}

function matchesMetadata(entity: QaseCaseEntity, payload: CasePayload): boolean {
  return (
    entity.title === payload.title &&
    // The suite moves when a case is restored from the archive, so it is part of the comparison.
    (entity.suite_id ?? null) === payload.suite_id &&
    entity.severity === payload.severity &&
    entity.priority === payload.priority &&
    entity.layer === payload.layer &&
    (entity.type ?? typeIds.functional) === payload.type &&
    (entity.behavior ?? behaviorIds.positive) === payload.behavior &&
    // Reads return a boolean, writes take 0/1.
    Boolean(entity.isManual) === (payload.isManual === 1)
  );
}

function matchesContent(entity: QaseCaseEntity, payload: CasePayload): boolean {
  return (
    text(entity.description) === text(payload.description) &&
    text(entity.preconditions) === text(payload.preconditions) &&
    text(entity.postconditions) === text(payload.postconditions) &&
    (entity.steps_type ?? "classic") === payload.steps_type &&
    JSON.stringify(stepsOf(entity.steps)) === JSON.stringify(stepsOf(payload.steps)) &&
    JSON.stringify(tagsOf(entity.tags)) === JSON.stringify([...payload.tags].sort())
  );
}

function stepsOf(steps: readonly QaseStepEntity[] | null | undefined): string[] {
  return (steps ?? []).map((step) =>
    JSON.stringify([text(step.action), text(step.expected_result), text(step.data)]),
  );
}

function tagsOf(tags: QaseCaseEntity["tags"]): string[] {
  return (tags ?? [])
    .map((tag) => (typeof tag === "string" ? tag : (tag.title ?? "")))
    .sort();
}

/** Normalizes a Markdown field so that trailing whitespace and CRLF differences never look like a change. */
function text(value: string | null | undefined): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

async function listAll<T>(path: string): Promise<T[]> {
  const collected: T[] = [];

  for (let offset = 0; ; ) {
    const page = await request<QaseList<T>>("GET", `${path}?limit=100&offset=${offset}`);
    const entities = page.result.entities ?? [];
    collected.push(...entities);

    if (entities.length < 100 || collected.length >= (page.result.total ?? 0)) {
      return collected;
    }

    offset += entities.length;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${baseUrl}/${path}`;

  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Token: token as string },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.ok) {
      const payload = (await response.json()) as T;

      // Qase throttles bursts: keep the whole sync well under its per-second limit.
      if (method !== "GET") await sleep(150);

      return payload;
    }

    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : attempt * 1_000);
      continue;
    }

    throw new Error(`${method} ${path} failed with ${response.status}: ${await response.text()}`);
  }
}

function resolveBaseUrl(hostname: string): string {
  if (/^https?:\/\//.test(hostname)) {
    return `${hostname.replace(/\/+$/, "")}/v1`;
  }

  if (hostname === "qase.io") {
    return "https://api.qase.io/v1";
  }

  return `https://api-${hostname}/v1`;
}

function writeIds(ids: ReadonlyMap<string, number>): void {
  const entries = qaseCases
    .map((entry) => [entry.key, ids.get(entry.key)] as const)
    .filter((entry): entry is readonly [string, number] => entry[1] !== undefined)
    .map(([key, id]) => `  ${JSON.stringify(key)}: ${id},`)
    .join("\n");

  writeFileSync(
    idsPath,
    [
      "/**",
      " * Numeric Qase TestOps case IDs generated by `pnpm --filter @order-desk/api",
      " * qase:sync`, keyed by the manifest keys from qase-manifest.ts.",
      " *",
      " * Do not edit this file by hand: the sync script rewrites it after creating the",
      " * cases in Qase. An empty map simply means the suite reports without case links.",
      " */",
      "export const qaseCaseIds: Readonly<Record<string, number | undefined>> = {",
      entries,
      "};",
      "",
    ].join("\n"),
  );
}

function report(): void {
  const prefix = dryRun ? "[dry-run] " : "";
  console.info(`${prefix}Qase project ${project} via ${baseUrl}`);

  for (const suite of createdSuites) console.info(`${prefix}suite to create: ${suite}`);
  for (const entry of createdCases) console.info(`${prefix}case to create: ${entry}`);
  for (const entry of updatedCases) console.info(`${prefix}case to update: ${entry}`);
  for (const entry of archivedCases) {
    console.info(`${prefix}case ${dryRun ? "to archive" : "archived"}: ${entry}`);
  }

  const unchanged = qaseCases.length - createdCases.length - updatedCases.length;
  console.info(
    `${prefix}${qaseCases.length} manifest cases: ${createdCases.length} new, ${updatedCases.length} updated, ` +
      `${unchanged} unchanged (${createdSuites.length} new suites); ` +
      `${archivedCases.length} ${dryRun ? "to archive" : "archived"}`,
  );

  if (!dryRun) {
    console.info(`Wrote ${resolvedIds.size} case IDs to ${idsPath.slice(repoRoot.length + 1)}`);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
