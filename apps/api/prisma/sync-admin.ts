import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: resolve(fileURLToPath(new URL("../../../", import.meta.url)), ".env") });

const [{ prisma }, { readAdminCredentials, syncAdministrator }] = await Promise.all([
  import("../src/database/prisma.service.ts"),
  import("../src/auth/admin-account.ts"),
]);

try {
  const credentials = readAdminCredentials();
  const outcome = await syncAdministrator(prisma, credentials);

  if (outcome.action === "created") {
    console.info(`Administrator ${outcome.email} created from ADMIN_EMAIL and ADMIN_PASSWORD.`);
  } else if (outcome.action === "unchanged") {
    console.info(`Administrator ${outcome.email} matches the environment; no changes made.`);
  } else {
    const renamed = outcome.renamedFrom ? ` (moved from ${outcome.renamedFrom})` : "";
    const password = outcome.passwordChanged ? "password replaced" : "password kept";
    console.info(`Administrator ${outcome.email} updated${renamed}: ${password}.`);

    if (outcome.revokedSessions > 0) {
      console.info(
        `${outcome.revokedSessions} session(s) revoked; sign in again with ADMIN_PASSWORD.`,
      );
    }
  }
} finally {
  await prisma.$disconnect();
}
