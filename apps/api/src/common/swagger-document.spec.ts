import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OpenAPIObject } from "@nestjs/swagger";
import { hideDisabledDevTools } from "./swagger-document.js";

function documentFixture(): OpenAPIObject {
  return {
    openapi: "3.0.0",
    info: { title: "Order Desk API", version: "1.0", description: "" },
    paths: {
      "/api/orders": { get: { responses: {} } },
      "/api/devtools/users": { get: { responses: {}, tags: ["devtools"] } },
      "/api/devtools/reset": { post: { responses: {}, tags: ["devtools"] } },
    },
    components: {
      schemas: {
        CreateOrderDto: { type: "object", properties: {} },
        CreateDevToolUserDto: { type: "object", properties: {} },
        ResetDevToolsDataDto: { type: "object", properties: {} },
      },
    },
  } as unknown as OpenAPIObject;
}

describe("hideDisabledDevTools", () => {
  it("removes devtools routes and schemas from the document while the feature flag is off", () => {
    const document = documentFixture();

    hideDisabledDevTools(document, false);

    assert.deepEqual(Object.keys(document.paths), ["/api/orders"]);
    assert.deepEqual(Object.keys(document.components?.schemas ?? {}), ["CreateOrderDto"]);
  });

  it("keeps the devtools routes and schemas once the feature flag is on", () => {
    const document = documentFixture();

    hideDisabledDevTools(document, true);

    assert.deepEqual(Object.keys(document.paths), [
      "/api/orders",
      "/api/devtools/users",
      "/api/devtools/reset",
    ]);
    assert.deepEqual(Object.keys(document.components?.schemas ?? {}), [
      "CreateOrderDto",
      "CreateDevToolUserDto",
      "ResetDevToolsDataDto",
    ]);
  });
});
