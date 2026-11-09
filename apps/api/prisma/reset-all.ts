import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: resolve(fileURLToPath(new URL("../../../", import.meta.url)), ".env") });

const [{ prisma }, { readAdminCredentials, resetAllData }, { ObjectStorageService }] = await Promise.all([
  import("../src/database/prisma.service.ts"),
  import("../src/devtools/reset.ts"),
  import("../src/storage/object-storage.service.ts"),
]);

try {
  const admin = readAdminCredentials();
  const report = await resetAllData(prisma, { admin, storage: new ObjectStorageService() });
  const { deleted, files } = report;

  console.info(`All data removed; administrator ${report.admin.email} recreated from .env.`);
  console.info(
    `Deleted ${deleted.users} users, ${deleted.sessions} sessions, ${deleted.categories} categories, ` +
      `${deleted.orders} orders, ${deleted.invoices} invoices, ${deleted.paymentReports} payment reports.`,
  );
  console.info("Invoice numbering restarts from 1; every session is revoked, sign in again with ADMIN_PASSWORD.");

  if (files?.error) {
    console.error(`Stored files were not purged: ${files.error}`);
    console.error("The database is reset; clear the bucket manually or rerun the command once storage is reachable.");
    process.exitCode = 1;
  } else if (files) {
    console.info(`Stored files purged: ${files.deleted} removed, ${files.failed} failed.`);
    if (files.failed > 0) process.exitCode = 1;
  }
} finally {
  await prisma.$disconnect();
}
