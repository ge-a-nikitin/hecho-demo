import type { OpenAPIObject } from "@nestjs/swagger";
import { describe, expect, it } from "vitest";
import { qc } from "../test-support/qase-case.js";
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

describe("API", () => {
  describe("Documentation", () => {
    it(qc("api.documentation.hides-devtools", "removes devtools routes and schemas from the document while the feature flag is off"), () => {
      const document = documentFixture();

      hideDisabledDevTools(document, false);

      expect(Object.keys(document.paths)).toEqual(["/api/orders"]);
      expect(Object.keys(document.components?.schemas ?? {})).toEqual(["CreateOrderDto"]);
    });

    it(qc("api.documentation.keeps-devtools", "keeps the devtools routes and schemas once the feature flag is on"), () => {
      const document = documentFixture();

      hideDisabledDevTools(document, true);

      expect(Object.keys(document.paths)).toEqual([
        "/api/orders",
        "/api/devtools/users",
        "/api/devtools/reset",
      ]);
      expect(Object.keys(document.components?.schemas ?? {})).toEqual([
        "CreateOrderDto",
        "CreateDevToolUserDto",
        "ResetDevToolsDataDto",
      ]);
    });
  });
});
