import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
config({ path: resolve(root, ".env") });
config({ path: resolve(root, ".env.e2e") });

const email = process.env.E2E_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.E2E_ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error("E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required");
}

const [{ auth }, { prisma }, { hashPassword }, { UserRole }] = await Promise.all([
  import("../src/auth/auth.ts"),
  import("../src/database/prisma.service.ts"),
  import("better-auth/crypto"),
  import("../src/generated/prisma/enums.ts"),
]);

try {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  if (!existing) {
    const result = await auth.api.signUpEmail({
      body: {
        name: "E2E администратор",
        email,
        password,
      },
    });
    await prisma.user.update({
      where: { id: result.user.id },
      data: { role: UserRole.ADMIN, isActive: true },
    });
    await prisma.session.deleteMany({ where: { userId: result.user.id } });
    console.info(`Created E2E administrator ${email}.`);
  } else {
    if (existing.role !== UserRole.ADMIN) {
      throw new Error(`The account ${email} exists but is not an administrator`);
    }
    const passwordAccount = await prisma.account.findFirst({
      where: { userId: existing.id, providerId: "credential" },
      select: { id: true },
    });
    if (!passwordAccount) {
      throw new Error(`The E2E administrator ${email} has no password account`);
    }
    const hashedPassword = await hashPassword(password);
    await prisma.$transaction([
      prisma.account.update({
        where: { id: passwordAccount.id },
        data: { password: hashedPassword },
      }),
      prisma.user.update({
        where: { id: existing.id },
        data: { name: "E2E администратор", role: UserRole.ADMIN, isActive: true },
      }),
      prisma.session.deleteMany({ where: { userId: existing.id } }),
    ]);
    console.info(`Updated E2E administrator ${email}.`);
  }
} finally {
  await prisma.$disconnect();
}
