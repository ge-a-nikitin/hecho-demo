import { expect, test } from "@playwright/test";

test("landing page opens and leads to login", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("landing-page")).toBeVisible();
  await expect(page.getByTestId("brand-home")).toBeVisible();

  await page.getByTestId("nav-login").click();
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByTestId("login-page")).toBeVisible();
});
