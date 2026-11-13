import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { qc } from "../test-support/qase-case.js";

/**
 * The container the API ships in decides how much a compromised dependency can
 * reach. Running as `root` inside the image is not an escalation on its own, but
 * it hands an exploited process every file of the image and the environment with
 * the database and S3 credentials, and an unlimited container can take the whole
 * VM with it - the tunnel and the CI runner live on the same machine.
 *
 * The properties live in two files that no test would otherwise touch: the image
 * chooses its user and its entrypoint, and the compose file describes the
 * filesystem and the limits it runs under. Reading those files is the only way to
 * check them from the suite, and the guard turns a quiet edit into a red test.
 */
const DOCKERFILE = fileURLToPath(new URL("../../Dockerfile", import.meta.url));
const COMPOSE = fileURLToPath(new URL("../../../../docker-compose.yml", import.meta.url));

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/** The `api` service of the compose file, up to the next service on the same level. */
function apiService(compose: string): string {
  const start = compose.indexOf("\n  api:\n");
  expect(start).toBeGreaterThan(-1);

  const rest = compose.slice(start + 1);
  const next = rest.search(/\n {2}[a-z][a-z0-9_-]*:\n/u);

  return next === -1 ? rest : rest.slice(0, next);
}

describe("Deployment", () => {
  describe("Container hardening", () => {
    it(
      qc("deployment.container.non-root", "runs the API as the unprivileged user without a writable home"),
      () => {
        const dockerfile = read(DOCKERFILE);

        // The last directive wins, so checking the last one catches a later
        // `USER root` added for a debugging session and forgotten.
        const users = [...dockerfile.matchAll(/^USER (\S+)$/gmu)].map((match) => match[1]);
        expect(users.at(-1)).toBe("node");

        // A read-only root filesystem is only usable when the entrypoint needs no
        // writable $HOME: corepack resolves `pnpm` through a cache under it, and
        // the container failed to start with exactly that error before the
        // migration command called the local binary instead.
        const command = /^CMD (.+)$/mu.exec(dockerfile)?.[1] ?? "";
        expect(command).toContain("migrate deploy");
        expect(command).not.toMatch(/\bpnpm\b/u);
        // `exec` hands PID 1 to the server, so a stop signal reaches it instead
        // of the shell that would otherwise ignore it and wait for the timeout.
        expect(command).toContain("exec node dist/main.js");
      },
    );

    it(
      qc("deployment.container.read-only-filesystem-and-limits", "keeps the root filesystem read-only inside a bounded container"),
      () => {
        const api = apiService(read(COMPOSE));

        expect(api).toMatch(/^ {4}read_only: true$/mu);
        // /tmp has to exist and be executable for the processes that still expect
        // a temporary directory, while `noexec` and `nosuid` stop it from being
        // used to run something.
        const tmpfs = /^ {4}tmpfs:\n((?: {6}- .*\n)+)/mu.exec(api)?.[1] ?? "";
        expect(tmpfs).toMatch(/- \/tmp:rw,noexec,nosuid,size=/u);

        expect(api).toMatch(/^ {4}cap_drop: \[ALL\]$/mu);
        expect(api).toMatch(/^\s+- no-new-privileges:true$/mu);

        // Limits stay overridable from .env, so a smaller VM can be tuned without
        // editing the compose file, but a default is always present.
        expect(api).toMatch(/^ {4}mem_limit: \$\{API_MEM_LIMIT:-\d+[mg]\}$/mu);
        expect(api).toMatch(/^ {4}cpus: \$\{API_CPUS:-\d+(?:\.\d+)?\}$/mu);
        expect(api).toMatch(/^ {4}pids_limit: \$\{API_PIDS_LIMIT:-\d+\}$/mu);
      },
    );
  });
});
