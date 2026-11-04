import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

config({ path: resolve(fileURLToPath(new URL("../../../", import.meta.url)), ".env") });

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
}

const [{ auth }, { prisma }] = await Promise.all([
  import("../src/auth/auth.ts"),
  import("../src/database/prisma.service.ts"),
]);

try {
  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    if (existingUser.role !== "ADMIN") {
      throw new Error(`The account ${email} already exists and is not an administrator`);
    }
    console.info(`Administrator ${email} already exists; no changes made.`);
  } else {
    const result = await auth.api.signUpEmail({
      body: {
        name: "Администратор",
        email,
        password,
      },
    });

    await prisma.user.update({
      where: { id: result.user.id },
      data: { role: "ADMIN" },
    });
    console.info(`Initial administrator ${email} created.`);
  }
} finally {
  await prisma.$disconnect();
}
