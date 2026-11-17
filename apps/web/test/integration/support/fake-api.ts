import { vi } from "vitest";

/**
 * Records the requests the application made and answers them from a route table.
 *
 * The stub sits on `fetch`, which is the boundary `api.ts` already owns, so the
 * case exercises the real client: headers, `credentials` and error mapping run
 * for real, and only the server behind them is replaced. A route is keyed by
 * `<METHOD> <path>`, matched against the part of the URL after the configured
 * base, so the address the client builds - development default or a proxy prefix
 * - never has to be known here.
 */
export type FakeReply = {
  status?: number;
  body?: unknown;
  /** Simulate a server that never answers, so the client's catch path runs. */
  networkError?: boolean;
};

export type FakeRoute = FakeReply | ((call: FakeCall, attempt: number) => FakeReply);

export type FakeCall = {
  method: string;
  path: string;
  body: FormData | string | null;
};

export type FakeApi = {
  /** Requests in the order they were made, as `<METHOD> <path>`. */
  calls: string[];
  /** The same requests with their bodies, for a case that asserts what was sent. */
  requests: FakeCall[];
  /** How many times a route was requested, which is how a retry is observed. */
  count: (route: string) => number;
};

const apiSuffix = /^.*\/api(?=\/)/u;

function toPath(url: string): string {
  const parsed = new URL(url, "http://localhost");

  return `${parsed.pathname}${parsed.search}`.replace(apiSuffix, "");
}

export function installFakeApi(routes: Record<string, FakeRoute>): FakeApi {
  const calls: string[] = [];
  const requests: FakeCall[] = [];

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init.method ?? "GET").toUpperCase();
    const path = toPath(url);
    const route = `${method} ${path}`;
    const call: FakeCall = {
      method,
      path,
      body: typeof init.body === "string" || init.body instanceof FormData ? init.body : null,
    };

    calls.push(route);
    requests.push(call);

    const handler = routes[route];
    if (!handler) throw new Error(`The application requested an unmapped route: ${route}`);

    const attempt = calls.filter((entry) => entry === route).length;
    const reply = typeof handler === "function" ? handler(call, attempt) : handler;

    if (reply.networkError) throw new TypeError("Failed to fetch");

    return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  return {
    calls,
    requests,
    count: (route) => calls.filter((entry) => entry === route).length,
  };
}
