import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Maps manifest keys to the spec files that actually run them.
 *
 * The mapping is derived, never hand-maintained: the manifest spec asserts both
 * directions of it, and the sync script credits the owning spec in the case
 * description. Keeping the scan in one place means the test and the sync can
 * never disagree about which file a key belongs to.
 *
 * The catalogue owns the cases of the browser suite too, so the scan covers
 * `apps/web` as well: without it a `web.*` key would look unused and the parity
 * test would fail on a case that does run.
 */

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const repoRoot = resolve(apiRoot, "../..");
const webRoot = resolve(repoRoot, "apps/web");
const scannedRoots = [
  { root: apiRoot, paths: ["src", "test"] },
  { root: webRoot, paths: ["src", "test"] },
] as const;
const specFile = /\.spec\.tsx?$/;
const caseCall = /\bqc\(\s*"([^"]+)"/g;

/** Paths stay relative to the package that owns the queue of the key: the api
 * paths keep their current shape, and a web spec is named from the repository
 * root so that TestOps shows `apps/web/...` instead of `../web/...`. */
function describe(file: string): string {
  return file.startsWith(`${webRoot}${sep}`) ? relative(repoRoot, file) : relative(apiRoot, file);
}

export function listSpecFiles(): string[] {
  return scannedRoots
    .flatMap(({ root, paths }) =>
      paths.flatMap((path) => {
        const directory = resolve(root, path);

        // A package may not carry both suites yet, and the parity test must not
        // depend on an empty directory staying in the repository.
        if (!existsSync(directory)) return [];

        return readdirSync(directory, { recursive: true, encoding: "utf8" }).map((entry) =>
          resolve(directory, entry),
        );
      }),
    )
    .filter((path) => specFile.test(path))
    .sort();
}

export function qcUsageIndex(): ReadonlyMap<string, readonly string[]> {
  const usage = new Map<string, string[]>();

  for (const file of listSpecFiles()) {
    const source = readFileSync(file, "utf8");

    for (const match of source.matchAll(caseCall)) {
      const key = match[1];
      const paths = usage.get(key) ?? [];
      const described = describe(file);

      if (!paths.includes(described)) paths.push(described);
      usage.set(key, paths);
    }
  }

  return new Map([...usage].sort(([left], [right]) => left.localeCompare(right)));
}
