import type { QaseCase } from "../types.js";

const clientAddressSuite = ["Deployment", "Client address"] as const;

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
] as const satisfies readonly QaseCase[];
