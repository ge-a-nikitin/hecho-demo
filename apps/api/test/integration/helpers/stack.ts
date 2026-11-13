import { randomUUID } from "node:crypto";

/**
 * Thin HTTP client for the ephemeral stack. It deliberately depends on nothing
 * but `fetch`, so the Vitest global setup can reuse it without loading the test
 * runner.
 */

export const API_URL = (process.env.TEST_API_URL ?? "http://127.0.0.1:7101").replace(/\/+$/u, "");
export const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? "admin@example.test";
export const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? "integration-admin-password";

/**
 * Better Auth rejects requests without a trusted Origin (MISSING_OR_NULL_ORIGIN),
 * so every call announces the origin configured as FRONTEND_ORIGIN in
 * docker-compose.test.yml.
 */
const CLIENT_ORIGIN = process.env.TEST_CLIENT_ORIGIN ?? "http://127.0.0.1:7100";

const DEVTOOLS_KEY = process.env.TEST_DEVTOOLS_API_KEY ?? "integration-devtools-key-at-least-32";
const TEST_USER_PASSWORD = "integration-test-password";

export type UserRole = "CUSTOMER" | "EXECUTOR" | "ADMIN";

export type ApiResponse<T = unknown> = { status: number; body: T };

export type Actor = {
  id: string;
  email: string;
  cookie: string;
  get: <T = unknown>(path: string) => Promise<ApiResponse<T>>;
  post: <T = unknown>(path: string, body?: unknown) => Promise<ApiResponse<T>>;
  patch: <T = unknown>(path: string, body?: unknown) => Promise<ApiResponse<T>>;
  upload: <T = unknown>(path: string, filename: string, bytes: Buffer) => Promise<ApiResponse<T>>;
};

type RequestOptions = {
  cookie?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export async function request<T = unknown>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const response = await fetch(`${API_URL}/api${path}`, {
    method,
    headers: {
      origin: CLIENT_ORIGIN,
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : undefined) as T,
  };
}

/**
 * Posts a multipart body the way the browser does. The content type is left to
 * `fetch`, because the multipart boundary has to match the one in the header.
 */
export async function upload<T = unknown>(
  path: string,
  cookie: string,
  filename: string,
  bytes: Buffer,
): Promise<ApiResponse<T>> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)]), filename);

  const response = await fetch(`${API_URL}/api${path}`, {
    method: "POST",
    headers: { origin: CLIENT_ORIGIN, cookie },
    body: form,
  });
  const text = await response.text();
  return {
    status: response.status,
    body: (text ? JSON.parse(text) : undefined) as T,
  };
}

export function actor(id: string, email: string, cookie: string): Actor {
  return {
    id,
    email,
    cookie,
    get: (path) => request("GET", path, { cookie }),
    post: (path, body) => request("POST", path, { cookie, body }),
    patch: (path, body) => request("PATCH", path, { cookie, body }),
    upload: (path, filename, bytes) => upload(path, cookie, filename, bytes),
  };
}

export async function waitForApi(timeoutMs = 180_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API_URL}/api/health`);
      if (response.ok) return;
      lastError = new Error(`GET /api/health answered ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }

  throw new Error(
    `The integration API at ${API_URL} never became healthy: ${String(lastError)}`,
  );
}

/**
 * Truncates the database and recreates the administrator. It fails loudly when
 * the devtools group is unavailable, which is what stops the suite from wiping a
 * stack that was not started for testing.
 */
export async function resetWorld(): Promise<void> {
  const response = await request("POST", "/devtools/reset", {
    body: { confirm: "reset-all-data", purgeFiles: false },
    headers: { "x-devtools-api-key": DEVTOOLS_KEY },
  });

  if (response.status !== 200) {
    throw new Error(
      `POST /api/devtools/reset answered ${response.status}: ${JSON.stringify(response.body)}. ` +
        `The integration suite requires its own stack with DEVTOOLS_ENABLED=true and refuses to run against ${API_URL} otherwise.`,
    );
  }
}

export async function signIn(email: string, password: string, attempts = 5): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${API_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { origin: CLIENT_ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (response.ok) {
      const cookie = response.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .filter((value) => value.includes("session_token"))
        .join("; ");
      if (!cookie) throw new Error(`Sign-in for ${email} returned no session cookie`);
      return cookie;
    }

    if ((response.status === 429 || response.status >= 500) && attempt < attempts) {
      await sleep(250 * attempt);
      continue;
    }

    throw new Error(`Sign-in for ${email} failed with ${response.status}: ${await response.text()}`);
  }
}

export async function signInAdmin(): Promise<Actor> {
  const cookie = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  const profile = await request<{ id: string }>("GET", "/users/me", { cookie });
  if (profile.status !== 200) {
    throw new Error(`GET /api/users/me answered ${profile.status} for the administrator`);
  }
  return actor(profile.body.id, ADMIN_EMAIL, cookie);
}

export async function createUser(
  role: UserRole,
  email: string,
  password = TEST_USER_PASSWORD,
): Promise<string> {
  const response = await request<{ id: string }>("POST", "/devtools/users", {
    body: { role, email, password },
    headers: { "x-devtools-api-key": DEVTOOLS_KEY },
  });

  if (response.status !== 201) {
    throw new Error(
      `POST /api/devtools/users answered ${response.status}: ${JSON.stringify(response.body)}`,
    );
  }
  return response.body.id;
}

export async function createActor(role: UserRole): Promise<Actor> {
  const email = `${role.toLowerCase()}-${randomUUID()}@example.test`;
  const id = await createUser(role, email);
  const cookie = await signIn(email, TEST_USER_PASSWORD);
  return actor(id, email, cookie);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
