import { expect, test } from "@playwright/test";
import { login, loginAsAdmin } from "./helpers";

const apiUrl = process.env.E2E_API_URL ?? "http://localhost:6201/api";
const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:6200";

test("administrator downloads, voids, and reissues an invoice", async ({ page, browser }) => {
  test.setTimeout(90_000);
  await loginAsAdmin(page);

  const suffix = Date.now();
  const categoryResponse = await page.request.post(`${apiUrl}/categories`, {
    data: { name: `E2E Счёт ${suffix}` },
  });
  expect(categoryResponse.ok()).toBeTruthy();
  const category = await categoryResponse.json() as { id: string };

  const executorEmail = `e2e-invoice-executor-${suffix}@example.test`;
  const executorPassword = `e2e-invoice-executor-${suffix}-password`;
  const executorResponse = await page.request.post(`${apiUrl}/users/executors`, {
    data: { name: `E2E Счет Исполнитель ${suffix}`, email: executorEmail, password: executorPassword },
  });
  expect(executorResponse.ok()).toBeTruthy();
  const executor = await executorResponse.json() as { id: string; name: string };

  const executorContext = await browser.newContext({ baseURL: baseUrl });
  const executorPage = await executorContext.newPage();
  const customerContext = await browser.newContext({ baseURL: baseUrl });
  const customerPage = await customerContext.newPage();

  try {
    await login(executorPage, executorEmail, executorPassword);
    const rateResponse = await executorPage.request.patch(`${apiUrl}/users/me/hourly-rate`, {
      data: { hourlyRate: 100 },
    });
    expect(rateResponse.ok()).toBeTruthy();

    const customerEmail = `e2e-invoice-customer-${suffix}@example.test`;
    await customerPage.goto("/register");
    await customerPage.getByTestId("auth-name").fill("E2E Счет Заказчик");
    await customerPage.getByTestId("auth-email").fill(customerEmail);
    await customerPage.getByTestId("auth-password").fill(`e2e-invoice-customer-${suffix}-password`);
    await customerPage.getByTestId("auth-submit").click();
    await expect(customerPage.getByTestId("customer-panel")).toBeVisible();

    const title = `E2E Счёт заказа ${suffix}`;
    const orderResponse = await customerPage.request.post(`${apiUrl}/orders`, {
      data: {
        title,
        description: "Заказ для проверки счёта.",
        categoryId: category.id,
        executorId: executor.id,
      },
    });
    expect(orderResponse.ok()).toBeTruthy();
    const order = await orderResponse.json() as { id: string };

    const submitResponse = await customerPage.request.post(`${apiUrl}/orders/${order.id}/submit`);
    expect(submitResponse.ok()).toBeTruthy();

    const estimateResponse = await executorPage.request.post(`${apiUrl}/orders/${order.id}/estimate`, {
      data: { hours: 2 },
    });
    expect(estimateResponse.ok()).toBeTruthy();
    const estimate = await estimateResponse.json() as { id: string };

    const acceptEstimateResponse = await customerPage.request.post(
      `${apiUrl}/orders/${order.id}/estimates/${estimate.id}/respond`,
      { data: { accepted: true } },
    );
    expect(acceptEstimateResponse.ok()).toBeTruthy();

    expect((await executorPage.request.post(`${apiUrl}/orders/${order.id}/time`, { data: { minutes: 120 } })).ok()).toBeTruthy();
    expect((await executorPage.request.post(`${apiUrl}/orders/${order.id}/submit-review`)).ok()).toBeTruthy();
    expect((await customerPage.request.post(`${apiUrl}/orders/${order.id}/accept`)).ok()).toBeTruthy();

    const invoiceResponse = await page.request.post(`${apiUrl}/orders/${order.id}/invoices`);
    expect(invoiceResponse.ok()).toBeTruthy();
    const invoice = await invoiceResponse.json() as { id: string; number: string };

    await page.goto("/admin");
    await page.getByTestId("admin-refresh").click();
    const orderCard = page.locator("article.order-list-card").filter({ hasText: title });
    await expect(orderCard).toBeVisible();
    await page.getByTestId(`open-order-${order.id}`).click();
    const detail = page.getByTestId("order-detail");
    await expect(detail).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await detail.getByTestId(`download-invoice-pdf-${invoice.id}`).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`${invoice.number}.pdf`);

    await detail.getByTestId("close-order-detail").click();
    await expect(detail).toHaveCount(0);
    await page.getByTestId("admin-refresh").click();

    const currentCard = page.locator("article.order-list-card").filter({ hasText: title });
    await currentCard.getByTestId(/^void-invoice-reason-/u).fill("Ошибка в реквизитах");
    await currentCard.getByRole("button", { name: "Аннулировать счёт" }).click();
    await expect(currentCard).toContainText("аннулирован");
    await expect(currentCard.getByTestId(`issue-invoice-${order.id}`)).toBeVisible();

    await currentCard.getByTestId(`issue-invoice-${order.id}`).click();
    await expect(currentCard.getByTestId(`issue-invoice-${order.id}`)).toHaveCount(0);
    await expect(currentCard.locator(".form-hint").filter({ hasText: "выставлен" })).toBeVisible();
  } finally {
    await customerContext.close();
    await executorContext.close();
  }
});
