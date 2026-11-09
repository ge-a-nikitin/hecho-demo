import type { OpenAPIObject } from "@nestjs/swagger";

const devToolsSchemaNames = ["CreateDevToolUserDto", "UpdateDevToolUserDto", "ResetDevToolsDataDto"];

/**
 * The devtools guard answers 404 while DEVTOOLS_ENABLED is not "true", so the
 * published document hides those routes as well instead of advertising
 * endpoints that Swagger UI would call into a 404.
 */
export function hideDisabledDevTools(document: OpenAPIObject, enabled: boolean): void {
  if (enabled) {
    return;
  }
  for (const path of Object.keys(document.paths)) {
    if (path.startsWith("/api/devtools")) {
      delete document.paths[path];
    }
  }
  const schemas = document.components?.schemas;
  if (!schemas) {
    return;
  }
  for (const name of devToolsSchemaNames) {
    delete schemas[name];
  }
}
