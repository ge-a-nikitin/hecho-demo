export const apiBaseUrl = (
  import.meta.env.VITE_API_URL ?? "http://localhost:6201/api"
).replace(/\/+$/u, "");

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    throw new ApiError(
      getErrorMessage(body, response.statusText || `HTTP ${response.status}`),
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function getErrorMessage(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null || !("message" in body)) return fallback;
  const message = body.message;
  if (typeof message === "string") return message;
  if (Array.isArray(message) && message.every((item) => typeof item === "string")) {
    return message.join(", ");
  }
  return fallback;
}
