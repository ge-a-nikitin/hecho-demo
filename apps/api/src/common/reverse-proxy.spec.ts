import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { qc } from "../test-support/qase-case.js";

/**
 * The nginx config in front of the API decides which address counts as the
 * client, and the API believes whatever arrives in `X-Forwarded-For`: Better
 * Auth reads a single-value header as the client address and a multi-value one
 * as no address at all, while the session row keeps exactly what it resolved.
 *
 * Two properties therefore have to hold in the shipped file: nginx overwrites
 * the forwarded address instead of appending to it, so a caller cannot smuggle
 * its own value in, and it only takes the address from `CF-Connecting-IP` when
 * the peer can be trusted. Neither can be observed from the integration stack,
 * which talks to the API without nginx, so the guard reads the file itself.
 * This module lives in the API suite because that is the only test runner the
 * repository has, and the contract it protects is the API's client address.
 */
const NGINX_CONF = fileURLToPath(new URL("../../../web/nginx.conf", import.meta.url));

function readConfig(): string {
  return readFileSync(NGINX_CONF, "utf8");
}

function apiLocationBlock(config: string): string {
  const start = config.indexOf("location /api/ {");
  expect(start).toBeGreaterThan(-1);

  const end = config.indexOf("\n    }", start);
  expect(end).toBeGreaterThan(start);

  return config.slice(start, end);
}

function proxyHeader(block: string, name: string): string | undefined {
  const match = new RegExp(`proxy_set_header\\s+${name}\\s+([^;]+);`, "i").exec(block);

  return match?.[1]?.trim();
}

function trustedPeers(config: string): string[] {
  return [...config.matchAll(/set_real_ip_from\s+([^;]+);/gu)].map((match) => match[1].trim());
}

describe("Deployment", () => {
  describe("Client address", () => {
    it(qc("deployment.client-address.overwrites-forwarded-for", "replaces the forwarded address instead of appending to it"), () => {
      const config = readConfig();

      expect(proxyHeader(apiLocationBlock(config), "X-Forwarded-For")).toBe("$remote_addr");
      expect(config).not.toContain("$proxy_add_x_forwarded_for");
    });

    it(qc("deployment.client-address.forwards-resolved-address", "sends the resolved address as both the real-IP and the forwarded header"), () => {
      const block = apiLocationBlock(readConfig());

      expect(proxyHeader(block, "X-Real-IP")).toBe("$remote_addr");
      expect(proxyHeader(block, "X-Forwarded-For")).toBe("$remote_addr");
    });

    it(qc("deployment.client-address.trusts-cloudflare", "takes CF-Connecting-IP only from the tunnel and the container network"), () => {
      const config = readConfig();

      expect(config).toMatch(/real_ip_header\s+CF-Connecting-IP;/u);
      expect(config).toMatch(/real_ip_recursive\s+off;/u);
      // cloudflared reaches the container through the published loopback port,
      // which Docker re-originates from the bridge gateway: a loopback-only list
      // would leave every client on the gateway address.
      expect(trustedPeers(config)).toEqual(
        expect.arrayContaining(["127.0.0.1", "::1", "172.16.0.0/12"]),
      );
    });
  });
});
