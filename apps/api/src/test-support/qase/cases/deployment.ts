import type { QaseCase } from "../types.js";

const clientAddressSuite = ["Deployment", "Client address"] as const;
const responseHeadersSuite = ["Deployment", "Response headers"] as const;
const containerSuite = ["Deployment", "Container hardening"] as const;

export const deploymentCases = [
  {
    key: "deployment.client-address.overwrites-forwarded-for",
    suite: clientAddressSuite,
    title: "replaces the forwarded address instead of appending to it",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "negative",
    description:
      "`X-Forwarded-For` is a request header like any other, so a caller can set it. Appending the peer " +
      "with `$proxy_add_x_forwarded_for` hands the API a client-supplied value followed by the real one, " +
      "and Better Auth resolves a multi-value header to no address at all: the session row then keeps " +
      "`ipAddress = null`, every caller lands in one rate-limit bucket and the audit trail loses the " +
      "client. Overwriting with `$remote_addr` keeps exactly one address, which is the peer nginx " +
      "resolved, so the header can no longer carry anything the caller chose.",
    preconditions: "The tracked `apps/web/nginx.conf`, read directly by the case.",
    steps: [
      {
        action: "Read the `location /api/` block and look at its `X-Forwarded-For` header.",
        expected: "The value is `$remote_addr`, not `$proxy_add_x_forwarded_for`.",
      },
      {
        action: "Search the whole file for `$proxy_add_x_forwarded_for`.",
        expected: "No occurrence remains, so no other location can append a client-supplied value.",
      },
    ],
  },
  {
    key: "deployment.client-address.forwards-resolved-address",
    suite: clientAddressSuite,
    title: "sends the resolved address as both the real-IP and the forwarded header",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The API is configured with `TRUST_PROXY=true`, so Express takes the client address from the " +
      "forwarded headers, and Better Auth stores the same value on the session. Both headers must carry " +
      "the address nginx resolved, because a missing one silently falls back to the container network " +
      "address: a session created through the tunnel used to store `172.27.0.1` - the Docker bridge " +
      "gateway - for every client in the world.",
    preconditions: "The tracked `apps/web/nginx.conf`, read directly by the case.",
    steps: [
      {
        action: "Read the `location /api/` block and look at `X-Real-IP` and `X-Forwarded-For`.",
        expected: "Both are set to `$remote_addr`, which is the address after real-IP processing.",
      },
    ],
  },
  {
    key: "deployment.client-address.trusts-cloudflare",
    suite: clientAddressSuite,
    title: "takes CF-Connecting-IP only from the tunnel and the container network",
    severity: "critical",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "positive",
    description:
      "Cloudflare terminates TLS and writes the client address into `CF-Connecting-IP`, but nginx " +
      "ignores that header unless the real-IP module accepts the peer. Trusting every peer would let " +
      "any caller spoof the address; trusting only `127.0.0.1` does not work either, because Docker " +
      "publishes the web port on the loopback interface and re-originates the connection from the " +
      "bridge gateway - the container sees `172.27.0.1`, not `127.0.0.1`. The case pins the peer list " +
      "to the loopback addresses and the private ranges the container network lives in, and it pins " +
      "`real_ip_recursive off` so a single header value is taken as is.",
    preconditions: "The tracked `apps/web/nginx.conf`, read directly by the case.",
    steps: [
      {
        action: "Read the `real_ip_header` directive.",
        expected: "It names `CF-Connecting-IP`, the header Cloudflare sets at the edge.",
      },
      {
        action: "Read the `set_real_ip_from` list.",
        expected:
          "It covers `127.0.0.1`, `::1` and `172.16.0.0/12`, so both the loopback and the Docker " +
          "bridge gateway are trusted.",
      },
      {
        action: "Read the `real_ip_recursive` directive.",
        expected: "It is `off`, so the header is not walked as a chain.",
      },
    ],
  },
  {
    key: "deployment.headers.nosniff",
    suite: responseHeadersSuite,
    title: "refuses to let the browser re-interpret a declared type",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "positive",
    description:
      "The SPA, the API and every download share one origin, and a download is an attachment only because " +
      "the response says so. With `X-Content-Type-Options: nosniff` the browser stops second-guessing a " +
      "declared type, so a file whose bytes look like a page cannot be rendered from the application origin " +
      "even in a future inline preview. The guard reads the shipped file because the integration stack never " +
      "runs nginx, and it expects three occurrences: nginx discards the inherited `add_header` directives in " +
      "a location that declares its own, so the two locations that set `Cache-Control` repeat the header.",
    preconditions:
      "The repository holds the shipped `apps/web/nginx.conf`; the guard reads the file instead of a running " +
      "nginx, because the integration stack speaks to the API directly.",
    steps: [
      {
        action: "Count the `add_header X-Content-Type-Options \"nosniff\" always;` lines in `apps/web/nginx.conf`.",
        expected: "There are exactly three: the server block and the two cached locations.",
      },
    ],
  },
  {
    key: "deployment.container.non-root",
    suite: containerSuite,
    title: "runs the API as the unprivileged user without a writable home",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "positive",
    description:
      "The API container held the database password, the S3 keys and the Better Auth secret while running " +
      "as `root`, so a dependency that turns into code execution inherited every file of the image and the " +
      "ability to modify it. The last `USER` directive therefore has to be `node`, and the entrypoint has to " +
      "work without a writable `$HOME`: corepack resolves `pnpm` through a cache under it, which a " +
      "read-only root filesystem does not provide - the container failed to start with exactly that error " +
      "before the migration called the local binary. `exec` keeps the server as PID 1 so a stop signal " +
      "reaches it instead of the wrapping shell.",
    preconditions:
      "The repository holds the shipped `apps/api/Dockerfile`; the guard reads the file, because the suites " +
      "never build and inspect a container.",
    steps: [
      {
        action: "Collect every `USER` directive of `apps/api/Dockerfile` and take the last one.",
        expected: "It is `node`, so no later directive brings `root` back.",
      },
      {
        action: "Read the `CMD` line.",
        expected:
          "It runs `prisma migrate deploy` and then `exec node dist/main.js`, and it never calls `pnpm`.",
      },
    ],
  },
  {
    key: "deployment.container.read-only-filesystem-and-limits",
    suite: containerSuite,
    title: "keeps the root filesystem read-only inside a bounded container",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "security",
    behavior: "positive",
    description:
      "The API writes nothing at run time - uploads stay in memory, the invoice PDF is rendered in memory " +
      "and Prisma only reads its schema - so the container can run with a read-only root filesystem and a " +
      "memory-backed `/tmp`. Dropped capabilities and `no-new-privileges` remove the privileged and setuid " +
      "paths an exploited dependency would look for, while the memory, CPU and process limits keep one " +
      "leaking process from taking the tunnel and the CI runner that share the VM down with it. The limits " +
      "are read from `API_MEM_LIMIT`, `API_CPUS` and `API_PIDS_LIMIT` with a default, so a smaller VM is " +
      "tuned in `.env` instead of the compose file.",
    preconditions: "The repository holds the shipped `docker-compose.yml`.",
    steps: [
      {
        action: "Read the `api` service of `docker-compose.yml`.",
        expected:
          "It sets `read_only: true` and mounts `/tmp` as `rw,noexec,nosuid` with a size, drops all " +
          "capabilities and enables `no-new-privileges`.",
      },
      {
        action: "Read the resource limits of that service.",
        expected:
          "`mem_limit`, `cpus` and `pids_limit` are set and fall back to a default through the " +
          "`API_*` variables.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
