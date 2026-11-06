import { expect, test } from "@playwright/test";
import { login, loginAsAdmin } from "./helpers";

const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:6200";

test("administrator manages executor and customer accounts", async ({ page, browser }) => {
  test.setTimeout(60_000);
  await loginAsAdmin(page);

  const suffix = Date.now();
  const customerEmail = `e2e-users-customer-${suffix}@example.test`;
  const customerContext = await browser.newContext({ baseURL: baseUrl });
  const customerPage = await customerContext.newPage();
  try {
    await customerPage.goto("/register");
    await customerPage.getByTestId("auth-name").fill("E2E Клиент управления");
    await customerPage.getByTestId("auth-email").fill(customerEmail);
    await customerPage.getByTestId("auth-password").fill(`e2e-users-customer-${suffix}-password`);
    await customerPage.getByTestId("auth-submit").click();
    await expect(customerPage.getByTestId("customer-panel")).toBeVisible();
  } finally {
    await customerContext.close();
  }

  await page.getByTestId("panel-users-link").click();
  await expect(page.getByTestId("admin-users")).toBeVisible();

  const executorEmail = `e2e-users-executor-${suffix}@example.test`;
  const executorPassword = `e2e-users-executor-${suffix}-password`;
  const updatedName = `E2E Исполнитель обновлён ${suffix}`;
  await page.getByTestId("create-user-executor").click();
  await page.getByTestId("new-executor-name").fill(`E2E Исполнитель ${suffix}`);
  await page.getByTestId("new-executor-email").fill(executorEmail);
  await page.getByTestId("new-executor-password").fill(executorPassword);
  await page.getByTestId("submit-new-executor").click();
  await expect(page.getByTestId("create-user-executor-form")).toBeHidden();

  let executorRow = page.locator("article.admin-list-row").filter({ hasText: executorEmail });
  await expect(executorRow).toContainText("Ставка не задана");

  await executorRow.getByRole("button", { name: "Изменить имя" }).click();
  await executorRow.getByTestId(/^executor-name-input-/u).fill(updatedName);
  await executorRow.getByRole("button", { name: "Сохранить" }).click();
  await expect(executorRow).toContainText(updatedName);

  const resetPassword = `e2e-users-reset-${suffix}-password`;
  await executorRow.getByRole("button", { name: "Сбросить пароль" }).click();
  await executorRow.getByTestId(/^new-password-/u).fill(resetPassword);
  await executorRow.getByRole("button", { name: "Сохранить" }).click();
  await expect(executorRow.getByTestId(/^new-password-/u)).toHaveCount(0);

  const executorContext = await browser.newContext({ baseURL: baseUrl });
  const executorPage = await executorContext.newPage();
  try {
    await login(executorPage, executorEmail, resetPassword);
    await expect(executorPage.getByTestId("executor-panel")).toBeVisible();
  } finally {
    await executorContext.close();
  }

  executorRow = page.locator("article.admin-list-row").filter({ hasText: executorEmail });
  await executorRow.getByRole("button", { name: "Деактивировать" }).click();
  await expect(executorRow.getByText("Неактивен")).toBeVisible();

  await page.getByTestId("users-show-inactive").uncheck();
  await expect(executorRow).toHaveCount(0);
  await page.getByTestId("users-show-inactive").check();
  await expect(executorRow).toBeVisible();

  await executorRow.getByRole("button", { name: "Активировать" }).click();
  await expect(executorRow.getByText("Неактивен")).toHaveCount(0);

  await page.getByTestId("refresh-users").click();
  const customerRow = page.locator("article.admin-list-row").filter({ hasText: customerEmail });
  await expect(customerRow).toBeVisible();
  await customerRow.getByRole("button", { name: "Деактивировать" }).click();
  await expect(customerRow.getByText("Неактивен")).toBeVisible();
  await customerRow.getByRole("button", { name: "Активировать" }).click();
  await expect(customerRow.getByText("Неактивен")).toHaveCount(0);
});
