import { afterEach, describe, expect, it, vi } from "vitest";
import { qc } from "../../api/src/test-support/qase-case";
import { apiBaseUrl, apiRequest, ApiError } from "./api";

const fetchMock = vi.fn<typeof fetch>();

function respond(status: number, body?: unknown, statusText = ""): Response {
  const headers = body === undefined ? undefined : { "Content-Type": "application/json" };

  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    statusText,
    headers,
  });
}

function lastRequestInit(): RequestInit {
  const calls = fetchMock.mock.calls;

  return calls[calls.length - 1][1] ?? {};
}

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("Web", () => {
  describe("API client", () => {
    it(
      qc(
        "web.api.error-contract",
        "turns a failed response into the status, the code and the message of the API",
      ),
      async () => {
        vi.stubGlobal("fetch", fetchMock);

        fetchMock.mockResolvedValueOnce(
          respond(409, { message: "The order has already been taken.", code: "ORDER_CONFLICT" }),
        );

        const described = await apiRequest("/orders/1").catch((error: unknown) => error);

        expect(described).toBeInstanceOf(ApiError);
        expect(described).toMatchObject({
          name: "ApiError",
          status: 409,
          code: "ORDER_CONFLICT",
          message: "The order has already been taken.",
        });

        fetchMock.mockResolvedValueOnce(respond(418, undefined, ""));

        const unmapped = await apiRequest("/orders/1").catch((error: unknown) => error);

        expect(unmapped).toMatchObject({ status: 418, code: "REQUEST_FAILED", message: "HTTP 418" });

        fetchMock.mockResolvedValueOnce(respond(500, undefined, "Internal Server Error"));

        const server = await apiRequest("/orders/1").catch((error: unknown) => error);

        expect(server).toMatchObject({
          status: 500,
          code: "INTERNAL_SERVER_ERROR",
          message: "Internal Server Error",
        });

        fetchMock.mockResolvedValueOnce(
          respond(400, { message: ["title must not be empty", "budget must be positive"] }),
        );

        const validation = await apiRequest("/orders/1").catch((error: unknown) => error);

        expect(validation).toMatchObject({
          code: "BAD_REQUEST",
          message: "title must not be empty, budget must be positive",
        });
      },
    );

    it(
      qc(
        "web.api.request-shape",
        "sends JSON by default, reads `204` as empty and reports an unreachable server",
      ),
      async () => {
        vi.stubGlobal("fetch", fetchMock);

        fetchMock.mockResolvedValueOnce(respond(200, { id: "order-1" }));

        await expect(
          apiRequest("/orders", { method: "POST", body: JSON.stringify({ title: "Boiler" }) }),
        ).resolves.toEqual({ id: "order-1" });

        expect(fetchMock.mock.calls[0][0]).toBe(`${apiBaseUrl}/orders`);
        expect(new Headers(lastRequestInit().headers).get("Content-Type")).toBe("application/json");
        expect(lastRequestInit().credentials).toBe("include");

        const form = new FormData();

        form.set("file", new Blob(["report"]), "report.txt");
        fetchMock.mockResolvedValueOnce(respond(200, { id: "file-1" }));

        await apiRequest("/orders/1/files", { method: "POST", body: form });

        expect(new Headers(lastRequestInit().headers).has("Content-Type")).toBe(false);

        fetchMock.mockResolvedValueOnce(respond(204));

        await expect(apiRequest("/orders/1", { method: "DELETE" })).resolves.toBeUndefined();

        fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

        await expect(apiRequest("/orders")).rejects.toMatchObject({
          name: "ApiError",
          status: 0,
          code: "NETWORK_ERROR",
        });

        const abort = new DOMException("The operation was aborted.", "AbortError");

        fetchMock.mockRejectedValueOnce(abort);

        await expect(apiRequest("/orders", { signal: new AbortController().signal })).rejects.toBe(
          abort,
        );
      },
    );
  });
});
