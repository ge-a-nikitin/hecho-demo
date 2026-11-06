import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

test("administrator creates, renames, and deactivates a category", async ({ page }) => {
  await loginAsAdmin(page);

  await page.getByTestId("panel-categories-link").click();
  await expect(page).toHaveURL(/\/admin\/categories$/u);
  await expect(page.getByTestId("admin-categories")).toBeVisible();

  const originalName = `E2E категория ${Date.now()}`;
  const renamedName = `${originalName} обновлена`;

  await page.getByTestId("category-name-input").fill(originalName);
  await page.getByTestId("create-category").click();

  const categoryRow = page.locator("article").filter({ hasText: originalName });
  await expect(categoryRow).toBeVisible();

  await categoryRow.locator('[data-testid^="rename-category-"]').click();
  await page.locator('input[data-testid^="category-edit-name-"]').fill(renamedName);
  await page.locator('[data-testid^="save-category-"]').click();

  const renamedRow = page.locator("article").filter({ hasText: renamedName });
  await expect(renamedRow).toBeVisible();

  await renamedRow.locator('[data-testid^="category-active-toggle-"]').click();
  await expect(renamedRow.locator('[data-testid^="category-inactive-"]')).toBeVisible();
  await expect(
    renamedRow.locator('[data-testid^="category-active-toggle-"]'),
  ).toHaveText("Активировать");
});
