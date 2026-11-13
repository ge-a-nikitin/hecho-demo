import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { qc } from "../../src/test-support/qase-case.js";
import { createActor, resetWorld, signInAdmin, waitForApi, API_URL, type Actor } from "./helpers/stack.js";

/**
 * The unit cases prove the quota logic against an in-memory database; only the
 * running stack shows that a real upload stops before the object reaches
 * SeaweedFS. The stack sets `ORDER_ATTACHMENT_LIMIT=3`, which keeps the case
 * cheap: four small files are enough to reach the limit.
 */

const ATTACHMENT_LIMIT = 3;
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64",
);

type Attachment = { id: string; filename: string; sizeBytes: number };

let customer: Actor;
let orderId: string;

beforeAll(async () => {
  await waitForApi();
  await resetWorld();

  const admin = await signInAdmin();
  const category = await admin.post<{ id: string }>("/categories", {
    name: `Quota ${randomUUID()}`,
  });
  expect(category.status).toBe(201);

  customer = await createActor("CUSTOMER");
  const order = await customer.post<{ id: string }>("/orders", {
    title: "Order with attachments",
    description: "Photos of the broken part",
    categoryId: category.body.id,
  });
  expect(order.status).toBe(201);
  orderId = order.body.id;
});

describe("Orders", () => {
  describe("Attachment content type (integration)", () => {
    it(
      qc(
        "integration.attachment-content-type.enforced",
        "refuses a page uploaded as a photo with a 415 and downloads the stored file as a binary stream",
      ),
      async () => {
        const admin = await signInAdmin();
        const category = await admin.post<{ id: string }>("/categories", {
          name: `Type ${randomUUID()}`,
        });
        const order = await customer.post<{ id: string }>("/orders", {
          title: "Order with a typed attachment",
          description: "One stored file",
          categoryId: category.body.id,
        });
        const typedOrderId = order.body.id;

        // The request says nothing about the type; the bytes are a page, so the
        // upload is refused before the object reaches the bucket.
        const refused = await customer.upload(
          `/orders/${typedOrderId}/attachments`,
          "photo.png",
          Buffer.from("<html><script>alert(1)</script></html>"),
        );
        expect(refused.status).toBe(415);

        const stored = await customer.upload<Attachment>(
          `/orders/${typedOrderId}/attachments`,
          "photo.png",
          ONE_PIXEL_PNG,
        );
        expect(stored.status).toBe(201);

        const download = await fetch(
          `${API_URL}/api/orders/${typedOrderId}/attachments/${stored.body.id}`,
          { headers: { cookie: customer.cookie } },
        );
        expect(download.status).toBe(200);
        expect(download.headers.get("content-type")).toBe("application/octet-stream");
        expect(download.headers.get("content-disposition")).toContain("attachment");
      },
    );
  });

  describe("Upload quotas (integration)", () => {
    it(
      qc(
        "integration.quota.attachment-limit",
        "accepts the attachments up to the order quota and answers the next one with a 409",
      ),
      async () => {
        const accepted = [];
        for (let index = 1; index <= ATTACHMENT_LIMIT; index += 1) {
          accepted.push(
            await customer.upload<Attachment>(`/orders/${orderId}/attachments`, `photo-${index}.png`, ONE_PIXEL_PNG),
          );
        }

        expect(accepted.map((response) => response.status)).toEqual(
          Array.from({ length: ATTACHMENT_LIMIT }, () => 201),
        );

        // The refusal is a conflict rather than a validation error: the request
        // is well formed, the order simply has no room left.
        const refused = await customer.upload<Attachment>(
          `/orders/${orderId}/attachments`,
          "one-too-many.png",
          ONE_PIXEL_PNG,
        );
        expect(refused.status).toBe(409);

        const order = await customer.get<{ attachments: Attachment[] }>(`/orders/${orderId}`);
        expect(order.body.attachments.map((attachment) => attachment.filename)).toEqual([
          "photo-1.png",
          "photo-2.png",
          "photo-3.png",
        ]);
      },
    );
  });
});
