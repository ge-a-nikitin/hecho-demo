-- CreateEnum
CREATE TYPE "PaymentReportStatus" AS ENUM ('PENDING', 'REJECTED', 'CONFIRMED');

-- CreateTable
CREATE TABLE "InvoicePaymentReport" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "objectKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "status" "PaymentReportStatus" NOT NULL DEFAULT 'PENDING',
    "reviewComment" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "InvoicePaymentReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePaymentReport_objectKey_key" ON "InvoicePaymentReport"("objectKey");

-- CreateIndex
CREATE INDEX "InvoicePaymentReport_invoiceId_submittedAt_idx" ON "InvoicePaymentReport"("invoiceId", "submittedAt");

-- Only one payment report per invoice may await review at a time.
CREATE UNIQUE INDEX "InvoicePaymentReport_one_pending_per_invoice_key"
ON "InvoicePaymentReport"("invoiceId")
WHERE "status" = 'PENDING';

ALTER TABLE "InvoicePaymentReport"
ADD CONSTRAINT "InvoicePaymentReport_review_consistency_check"
CHECK (
  ("status" = 'PENDING' AND "reviewedById" IS NULL AND "reviewedAt" IS NULL AND "reviewComment" IS NULL)
  OR ("status" = 'REJECTED' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL AND NULLIF(BTRIM("reviewComment"), '') IS NOT NULL)
  OR ("status" = 'CONFIRMED' AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL)
);

-- AddForeignKey
ALTER TABLE "InvoicePaymentReport" ADD CONSTRAINT "InvoicePaymentReport_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePaymentReport" ADD CONSTRAINT "InvoicePaymentReport_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePaymentReport" ADD CONSTRAINT "InvoicePaymentReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
