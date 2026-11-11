import { createAuthClient } from "better-auth/react";
import { apiBaseUrl } from "./api";

// Better Auth validates its base URL with new URL(), so the relative
// VITE_API_URL of the production image ("/api") has to be resolved against the
// current origin. The development default is already absolute and passes
// through unchanged, which keeps the production bundle domain-independent.
const authBaseUrl = new URL(`${apiBaseUrl}/auth`, window.location.origin).toString();

export const authClient = createAuthClient({
  baseURL: authBaseUrl,
  fetchOptions: {
    credentials: "include",
  },
});
