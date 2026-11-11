import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Maps manifest keys to the spec files that actually run them.
 *
 * The mapping is derived, never hand-maintained: the manifest spec asserts both
 * directions of it, and the sync script credits the owning spec in the case
 * description. Keeping the scan in one place means the test and the sync can
 * never disagree about which file a key belongs to.
 */

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const scannedRoots = ["src", "test"] as const;
const caseCall = /\bqc\(\s*"([^"]+)"/g;

export function listSpecFiles(): string[] {
  return scannedRoots
    .flatMap((root) => {
      const directory = resolve(apiRoot, root);

      return readdirSync(directory, { recursive: true, encoding: "utf8" }).map((path) =>
        resolve(directory, path),
      );
    })
    .filter((path) => path.endsWith(".spec.ts"))
    .sort();
}

export function qcUsageIndex(): ReadonlyMap<string, readonly string[]> {
  const usage = new Map<string, string[]>();

  for (const file of listSpecFiles()) {
    const source = readFileSync(file, "utf8");

    for (const match of source.matchAll(caseCall)) {
      const key = match[1];
      const paths = usage.get(key) ?? [];
      const relativePath = relative(apiRoot, file);

      if (!paths.includes(relativePath)) paths.push(relativePath);
      usage.set(key, paths);
    }
  }

  return new Map([...usage].sort(([left], [right]) => left.localeCompare(right)));
}
