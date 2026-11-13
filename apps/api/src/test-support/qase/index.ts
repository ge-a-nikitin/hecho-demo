import { apiCases } from "./cases/api.js";
import { authCases } from "./cases/auth.js";
import { categoriesCases } from "./cases/categories.js";
import { deploymentCases } from "./cases/deployment.js";
import { devtoolsCases } from "./cases/devtools.js";
import { invoicesCases } from "./cases/invoices.js";
import { ordersFilesCases } from "./cases/orders-files.js";
import { ordersCases } from "./cases/orders.js";
import { ordersIntegrationCases } from "./cases/orders-integration.js";
import { storageCases } from "./cases/storage.js";
import { toolingCases } from "./cases/tooling.js";
import { usersCases } from "./cases/users.js";
import type { QaseCase } from "./types.js";

/**
 * The full TestOps catalogue, one module per product area so that a change to
 * the order lifecycle never has to touch the devtools cases.
 *
 * Order matters only for readability of the generated ID file and for the
 * TestOps report: entries stay grouped by the suite tree below.
 */
export const qaseCases = [
  ...apiCases,
  ...authCases,
  ...ordersCases,
  ...ordersFilesCases,
  ...categoriesCases,
  ...invoicesCases,
  ...usersCases,
  ...devtoolsCases,
  ...storageCases,
  ...ordersIntegrationCases,
  ...deploymentCases,
  ...toolingCases,
] as const satisfies readonly QaseCase[];

export type QaseCaseKey = (typeof qaseCases)[number]["key"];

export type {
  QaseBehavior,
  QaseCase,
  QaseCaseType,
  QaseLayer,
  QasePriority,
  QaseSeverity,
  QaseStep,
} from "./types.js";
