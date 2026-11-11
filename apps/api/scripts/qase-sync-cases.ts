/**
 * Creates and updates the Qase TestOps cases described by
 * src/test-support/qase-manifest.ts, then writes the numeric case IDs back into
 * src/test-support/qase-case-ids.ts so the suites can link their results.
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
const severityIds = { blocker: 1, critical: 2, major: 3, normal: 4, minor: 5, trivial: 6 } as const;
const priorityIds = { high: 1, medium: 2, low: 3 } as const;
const layerIds = { e2e: 1, api: 2, unit: 3 } as const;

interface QaseSuite {
  id: number;
  title: string;
  parent_id?: number | null;
}

interface QaseCaseEntity {
  id: number;
  title: string;
  suite_id?: number | null;
  severity?: number | null;
  priority?: number | null;
  layer?: number | null;
  /** The API spells the automation flag in camelCase, unlike the rest of the payload. */
  isManual?: boolean | null;
}

interface QaseList<T> {
  result: { total?: number; count?: number; entities?: T[] };
}

interface QaseCreated {
  result: { id: number };
}

interface CasePayload {
  title: string;
  suite_id: number;
  severity: number;
  priority: number;
  layer: number;
  /** Create and update endpoints expect `isManual` as 0 (automated) or 1 (manual). */
  isManual: 0 | 1;
}

const suites = await listAll<QaseSuite>(`suite/${project}`);
const cases = await listAll<QaseCaseEntity>(`case/${project}`);
const createdSuites: string[] = [];
const createdCases: string[] = [];
const updatedCases: string[] = [];
const resolvedIds = new Map<string, number>();

for (const qaseCase of qaseCases) {
  const suiteId = await ensureSuite(qaseCase.suite);
  const payload = toPayload(qaseCase, suiteId);
  const existing = cases.find((entity) => entity.suite_id === suiteId && entity.title === payload.title);

  if (!existing) {
    if (dryRun) {
      createdCases.push(`${qaseCase.key} (new case in "${qaseCase.suite.join(" / ")}")`);
      continue;
    }

    const created = await request<QaseCreated>("POST", `case/${project}`, payload);
    cases.push({ id: created.result.id, ...payload });
    resolvedIds.set(qaseCase.key, created.result.id);
    createdCases.push(qaseCase.key);
    continue;
  }

  resolvedIds.set(qaseCase.key, existing.id);

  if (!needsUpdate(existing, payload)) {
    continue;
  }

  if (dryRun) {
    updatedCases.push(`${qaseCase.key} (#${existing.id} metadata differs)`);
    continue;
  }

  await request<QaseCreated>("PATCH", `case/${project}/${existing.id}`, payload);
  Object.assign(existing, payload);
  updatedCases.push(qaseCase.key);
}

if (!dryRun) {
  writeIds(resolvedIds);
}

report();

async function ensureSuite(path: readonly string[]): Promise<number> {
  let parentId: number | null = null;

  for (const [index, title] of path.entries()) {
    const currentPath = path.slice(0, index + 1).join(" / ");
    const existing = suites.find(
      (suite) => suite.title === title && (suite.parent_id ?? null) === parentId,
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
    suites.push({ id: created.result.id, title, parent_id: parentId });
    createdSuites.push(currentPath);
    parentId = created.result.id;
  }

  if (parentId === null) {
    throw new Error(`Suite path "${path.join(" / ")}" did not resolve to a suite ID.`);
  }

  return parentId;
}

function toPayload(qaseCase: QaseCase, suiteId: number): CasePayload {
  return {
    title: qaseCase.title,
    suite_id: suiteId,
    severity: severityIds[qaseCase.severity],
    priority: priorityIds[qaseCase.priority],
    layer: layerIds[qaseCase.layer],
    isManual: 0,
  };
}

function needsUpdate(existing: QaseCaseEntity, payload: CasePayload): boolean {
  return (
    existing.severity !== payload.severity ||
    existing.priority !== payload.priority ||
    existing.layer !== payload.layer ||
    // Reads return a boolean, writes take 0/1.
    Boolean(existing.isManual) !== (payload.isManual === 1)
  );
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

  const unchanged = qaseCases.length - createdCases.length - updatedCases.length;
  console.info(
    `${prefix}${qaseCases.length} manifest cases: ${createdCases.length} new, ${updatedCases.length} updated, ` +
      `${unchanged} unchanged (${createdSuites.length} new suites)`,
  );

  if (!dryRun) {
    console.info(`Wrote ${resolvedIds.size} case IDs to ${idsPath.slice(repoRoot.length + 1)}`);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
