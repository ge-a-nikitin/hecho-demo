import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

const apiUrl = process.env.E2E_API_URL ?? "http://localhost:6201/api";
const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:6200";

test("customer selects an executor, edits a draft, attaches a file, comments, and cancels", async ({ page, browser }) => {
  test.setTimeout(60_000);
  await loginAsAdmin(page);

  const suffix = Date.now();
  const categoryResponse = await page.request.post(`${apiUrl}/categories`, {
    data: { name: `E2E Категория ${suffix}` },
  });
  expect(categoryResponse.ok()).toBeTruthy();
  const category = await categoryResponse.json() as { id: string; name: string };

  const executorEmail = `e2e-flow-executor-${suffix}@example.test`;
  const executorPassword = `e2e-flow-executor-${suffix}-password`;
  const executorResponse = await page.request.post(`${apiUrl}/users/executors`, {
    data: { name: `E2E Исполнитель ${suffix}`, email: executorEmail, password: executorPassword },
  });
  expect(executorResponse.ok()).toBeTruthy();
  const executor = await executorResponse.json() as { id: string; name: string };

  const customerContext = await browser.newContext({ baseURL: baseUrl });
  const customerPage = await customerContext.newPage();
  try {
    const customerEmail = `e2e-customer-${suffix}@example.test`;
    await customerPage.goto("/register");
    await customerPage.getByTestId("auth-name").fill("E2E Заказчик");
    await customerPage.getByTestId("auth-email").fill(customerEmail);
    await customerPage.getByTestId("auth-password").fill(`e2e-customer-${suffix}-password`);
    await customerPage.getByTestId("auth-submit").click();
    await expect(customerPage.getByTestId("customer-panel")).toBeVisible();

    const title = `E2E Черновик ${suffix}`;
    await customerPage.getByTestId("create-order").click();
    await customerPage.getByTestId("order-title").fill(title);
    await customerPage.getByTestId("order-description").fill("Проверка полного сценария заказчика.");
    await customerPage.getByTestId("order-category").selectOption({ label: category.name });
    await customerPage.getByTestId("order-executor").selectOption({ label: executor.name });
    await customerPage.getByTestId("save-draft").click();
    await expect(customerPage.getByTestId("create-order-form")).toBeHidden();

    const draftCard = customerPage.locator("article.order-list-card").filter({ hasText: title });
    await expect(draftCard).toContainText("Черновик");
    await expect(draftCard).toContainText(executor.name);

    await draftCard.getByRole("button", { name: "Редактировать" }).click();
    const updatedTitle = `${title} обновлён`;
    await draftCard.getByTestId(/^edit-title-/u).fill(updatedTitle);
    await draftCard.getByTestId(/^edit-location-/u).fill("Москва");
    await draftCard.getByRole("button", { name: "Сохранить изменения" }).click();

    const updatedCard = customerPage.locator("article.order-list-card").filter({ hasText: updatedTitle });
    await expect(updatedCard).toContainText("Москва");

    await updatedCard.getByRole("link", { name: /Открыть карточку заказа/u }).click();
    let detail = customerPage.getByTestId("order-detail");
    await expect(detail).toBeVisible();

    await detail.getByTestId("order-attachment-file").setInputFiles({
      name: `brief-${suffix}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from("E2E attachment"),
    });
    await detail.getByTestId("upload-order-attachment").click();
    await expect(detail.getByText(`brief-${suffix}.txt`)).toBeVisible();

    const comment = `Комментарий E2E ${suffix}`;
    await detail.getByTestId("order-comment-input").fill(comment);
    await detail.getByTestId("submit-order-comment").click();
    await expect(detail.getByText(comment)).toBeVisible();
    await detail.getByTestId("close-order-detail").click();
    await expect(detail).toHaveCount(0);

    await updatedCard.getByRole("button", { name: "Отправить исполнителю" }).click();
    await expect(updatedCard).toContainText("Назначена");

    await updatedCard.getByRole("link", { name: /Открыть карточку заказа/u }).click();
    detail = customerPage.getByTestId("order-detail");
    await expect(detail).toBeVisible();
    await expect(detail.getByTestId("cancel-order-form")).toBeVisible();

    await detail.getByTestId("cancel-order-submit").click();
    await expect(detail.locator(".order-status")).toHaveText("Отменена");
    await expect(detail.getByTestId("cancel-order-form")).toHaveCount(0);
  } finally {
    await customerContext.close();
  }
});
