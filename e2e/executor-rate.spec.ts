import { expect, test } from "@playwright/test";
import { login, loginAsAdmin } from "./helpers";

const apiUrl = process.env.E2E_API_URL ?? "http://localhost:6201/api";

test("executor sets their own hourly rate while admin cannot change it", async ({ page }) => {
  await loginAsAdmin(page);

  const suffix = Date.now();
  const email = `e2e-executor-${suffix}@example.test`;
  const password = `e2e-executor-${suffix}-password`;
  const createResponse = await page.request.post(`${apiUrl}/users/executors`, {
    data: { name: "E2E Исполнитель", email, password },
  });
  expect(createResponse.ok()).toBeTruthy();
  const executor = await createResponse.json() as { id: string };

  const adminRateUpdate = await page.request.patch(`${apiUrl}/users/executors/${executor.id}`, {
    data: { hourlyRate: 99 },
  });
  expect(adminRateUpdate.status()).toBe(400);

  await page.getByTestId("sign-out").click();
  await expect(page).toHaveURL(/\/$/u);

  await login(page, email, password);
  await expect(page.getByTestId("executor-panel")).toBeVisible();
  await page.getByTestId("panel-profile-link").click();
  await expect(page.getByTestId("executor-rate-card")).toBeVisible();

  await page.getByTestId("profile-hourly-rate").fill("55.5");
  await page.getByTestId("save-hourly-rate").click();
  await expect(page.getByTestId("profile-hourly-rate")).toHaveValue(/^55\.5/u);

  await page.reload();
  await expect(page.getByTestId("profile-hourly-rate")).toHaveValue(/^55\.5/u);
});
