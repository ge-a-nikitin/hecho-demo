-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PAID', 'VOID');

-- DropIndex
DROP INDEX "Invoice_orderId_key";

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- CreateIndex
CREATE INDEX "Invoice_orderId_createdAt_idx" ON "Invoice"("orderId", "createdAt");

-- A reissued invoice is allowed only after the previous invoice has been voided.
CREATE UNIQUE INDEX "Invoice_one_current_per_order_key"
ON "Invoice"("orderId")
WHERE "status" <> 'VOID';

ALTER TABLE "Invoice"
ADD CONSTRAINT "Invoice_status_consistency_check"
CHECK (
  ("status" = 'ISSUED' AND "paidAt" IS NULL AND "voidedAt" IS NULL AND "voidedById" IS NULL AND "voidReason" IS NULL)
  OR ("status" = 'PAID' AND "paidAt" IS NOT NULL AND "voidedAt" IS NULL AND "voidedById" IS NULL AND "voidReason" IS NULL)
  OR ("status" = 'VOID' AND "paidAt" IS NULL AND "voidedAt" IS NOT NULL AND "voidedById" IS NOT NULL AND NULLIF(BTRIM("voidReason"), '') IS NOT NULL)
);

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
