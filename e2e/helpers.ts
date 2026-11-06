import { expect, type Page } from "@playwright/test";

for (const envFile of [".env", ".env.e2e"]) {
  try {
    process.loadEnvFile(envFile);
  } catch {
    // Environment variables may be supplied by the caller instead.
  }
}

export function adminCredentials(): { email: string; password: string } {
  return {
    email: process.env.E2E_ADMIN_EMAIL ?? "",
    password: process.env.E2E_ADMIN_PASSWORD ?? "",
  };
}

export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();
  await expect(page).not.toHaveURL(/\/login$/u);
}

export async function loginAsAdmin(page: Page): Promise<void> {
  const { email, password } = adminCredentials();
  expect(email, "E2E_ADMIN_EMAIL must be set").not.toBe("");
  expect(password, "E2E_ADMIN_PASSWORD must be set").not.toBe("");
  await login(page, email, password);
  await expect(page.getByTestId("admin-panel")).toBeVisible();
}
