/**
 * Pure planning rules for the TestOps sync.
 *
 * The script in `apps/api/scripts/qase-sync-cases.ts` performs the HTTP calls;
 * everything it decides is computed here, so the identity, archiving and
 * conflict rules are unit-tested offline instead of against a live project.
 *
 * Identity is the `order-desk:<key>` tag the sync writes on every case: a case
 * found by tag keeps its numeric ID (and therefore its history) when the
 * manifest renames it, moves it, or brings a retired key back. TestOps has no
 * case archive in its API, so retiring a case means moving it under
 * `Archive / <original top level suite>` rather than deleting anything.
 */

/** Prefix of the tag that ties a TestOps case to a catalogue key. */
export const caseTagPrefix = "order-desk:";

/** Top level suite that holds cases whose keys left the catalogue. */
export const archiveSuite = "Archive";

/** A catalogue entry with its suite path already resolved to a TestOps suite ID. */
export interface PlannedCase {
  readonly key: string;
  readonly title: string;
  readonly suiteId: number;
}

/** TestOps case as the planner sees it, independent of the API payload shape. */
export interface RemoteCase {
  readonly id: number;
  readonly title: string;
  readonly suiteId: number | null;
  readonly tags: readonly string[];
}

/** One node of the TestOps suite tree. */
export interface SuiteRef {
  readonly id: number;
  readonly title: string;
  readonly parentId: number | null;
}

export interface CaseMatch {
  readonly planned: PlannedCase;
  readonly remote: RemoteCase;
}

export interface MatchPlan {
  readonly matches: readonly CaseMatch[];
  readonly missing: readonly PlannedCase[];
  /** Keys whose tag appears on more than one case; the sync must not guess. */
  readonly conflicts: readonly { readonly key: string; readonly ids: readonly number[] }[];
}

export interface ArchiveMove {
  readonly key: string;
  readonly id: number;
  readonly from: readonly string[];
  readonly to: readonly string[];
}

/** Reads the catalogue key out of a case's tags, if the case is one of ours. */
export function caseKeyOf(tags: readonly string[]): string | undefined {
  for (const tag of tags) {
    if (tag.startsWith(caseTagPrefix)) {
      const key = tag.slice(caseTagPrefix.length).trim();

      return key === "" ? undefined : key;
    }
  }

  return undefined;
}

/** Walks the suite tree upwards and returns the path from the root, e.g. `["API", "Orders"]`. */
export function suitePathOf(suites: readonly SuiteRef[], suiteId: number | null): string[] {
  const suitesById = new Map(suites.map((suite) => [suite.id, suite]));
  const path: string[] = [];
  const visited = new Set<number>();
  let current = suiteId;

  while (current !== null && !visited.has(current)) {
    const suite = suitesById.get(current);

    if (suite === undefined) break;

    path.unshift(suite.title);
    visited.add(current);
    current = suite.parentId;
  }

  return path;
}

/**
 * Decides which remote case belongs to which catalogue key.
 *
 * A tag match always wins, so a renamed case is updated in place. A case
 * without any catalogue tag is adopted only when it already sits at the exact
 * manifest suite and title, which keeps cases created before tagging from being
 * duplicated on the first sync.
 */
export function planMatches(
  planned: readonly PlannedCase[],
  remote: readonly RemoteCase[],
): MatchPlan {
  const casesByKey = new Map<string, RemoteCase[]>();

  for (const remoteCase of remote) {
    const key = caseKeyOf(remoteCase.tags);

    if (key === undefined) continue;

    const found = casesByKey.get(key) ?? [];
    found.push(remoteCase);
    casesByKey.set(key, found);
  }

  const conflicts = [...casesByKey.entries()]
    .filter(([, cases]) => cases.length > 1)
    .map(([key, cases]) => ({ key, ids: cases.map((entry) => entry.id).sort((a, b) => a - b) }));

  const claimed = new Set<number>();
  const matches: CaseMatch[] = [];
  const missing: PlannedCase[] = [];

  for (const entry of planned) {
    const byTag = (casesByKey.get(entry.key) ?? []).find((entry) => !claimed.has(entry.id));

    if (byTag !== undefined) {
      claimed.add(byTag.id);
      matches.push({ planned: entry, remote: byTag });
      continue;
    }

    const byLocation = remote.find(
      (remoteCase) =>
        !claimed.has(remoteCase.id) &&
        caseKeyOf(remoteCase.tags) === undefined &&
        remoteCase.title === entry.title &&
        (remoteCase.suiteId ?? null) === entry.suiteId,
    );

    if (byLocation !== undefined) {
      claimed.add(byLocation.id);
      matches.push({ planned: entry, remote: byLocation });
      continue;
    }

    missing.push(entry);
  }

  return { matches, missing, conflicts };
}

/**
 * Plans the retirement of cases whose keys left the catalogue.
 *
 * Untagged cases are somebody else's and are never touched, and a case that is
 * already inside `Archive` is left alone so repeated syncs converge.
 */
export function planArchives(
  plannedKeys: ReadonlySet<string>,
  remote: readonly RemoteCase[],
  suites: readonly SuiteRef[],
): ArchiveMove[] {
  const moves: ArchiveMove[] = [];

  for (const remoteCase of remote) {
    const key = caseKeyOf(remoteCase.tags);

    if (key === undefined || plannedKeys.has(key)) continue;

    const from = suitePathOf(suites, remoteCase.suiteId);

    if (from[0] === archiveSuite) continue;

    moves.push({
      key,
      id: remoteCase.id,
      from,
      to: [archiveSuite, from[0] ?? "Unsorted"],
    });
  }

  return moves;
}
