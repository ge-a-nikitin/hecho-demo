import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import { Prisma } from "../generated/prisma/client.js";
import {
  InvoiceStatus,
  OrderStatus,
  PaymentReportStatus,
  UserRole,
} from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import { OrdersService } from "../orders/orders.service.js";
import type { UploadedOrderFile } from "../orders/order-files.service.js";
import { ObjectStorageService } from "../storage/object-storage.service.js";
import type { VoidInvoiceDto } from "./invoices.dto.js";

type Actor = { id: string; role: UserRole };
const paymentReportResponse = {
  id: true,
  filename: true,
  sizeBytes: true,
  status: true,
  reviewComment: true,
  submittedAt: true,
  reviewedAt: true,
} as const;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly storage: ObjectStorageService,
  ) {}

  async issue(orderId: string, actor: Actor) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.workOrder.findUnique({
          where: { id: orderId },
          include: {
            customer: { select: { name: true } },
            executor: { select: { name: true } },
          },
        });
        if (!order) throw new NotFoundException("Order not found");
        const isFirstInvoice = order.status === OrderStatus.ON_REVIEW;
        const isReissue = order.status === OrderStatus.INVOICE_ISSUED;
        if (
          (!isFirstInvoice && !isReissue) ||
          !order.acceptedAt ||
          !order.executorId ||
          !order.executor ||
          !order.approvedHours ||
          !order.approvedHourlyRate ||
          !order.approvedAmount
        ) {
          throw new ConflictException("Only accepted work with an approved estimate can be invoiced");
        }
        if (isReissue) {
          const currentInvoice = await tx.invoice.findFirst({
            where: { orderId, status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PAID] } },
            select: { id: true },
          });
          if (currentInvoice) throw new ConflictException("This order already has an active invoice");
        }

        const lock = await tx.workOrder.updateMany({
          where: {
            id: orderId,
            status: order.status,
            acceptedAt: { not: null },
          },
          data: { updatedAt: new Date() },
        });
        if (lock.count !== 1) throw new ConflictException("Order has already changed");

        const now = new Date();
        const year = now.getUTCFullYear();
        const [sequence] = await tx.$queryRaw<Array<{ lastNumber: number }>>`
          INSERT INTO "InvoiceSequence" ("year", "lastNumber", "updatedAt")
          VALUES (${year}, 1, NOW())
          ON CONFLICT ("year")
          DO UPDATE SET "lastNumber" = "InvoiceSequence"."lastNumber" + 1, "updatedAt" = NOW()
          RETURNING "lastNumber"
        `;
        if (!sequence) throw new Error("Invoice number sequence did not return a value");
        const number = `INV-${year}-${String(sequence.lastNumber).padStart(6, "0")}`;

        const invoice = await tx.invoice.create({
          data: {
            orderId,
            issuedById: actor.id,
            number,
            customerName: order.customer.name,
            executorName: order.executor.name,
            hours: order.approvedHours,
            hourlyRate: order.approvedHourlyRate,
            amount: order.approvedAmount,
            issuedAt: now,
          },
        });
        if (isFirstInvoice) {
          await tx.workOrder.update({
            where: { id: orderId },
            data: { status: OrderStatus.INVOICE_ISSUED },
          });
        }
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            changedById: actor.id,
            fromStatus: order.status,
            toStatus: OrderStatus.INVOICE_ISSUED,
            note: `${isReissue ? "Reissued" : "Issued"} invoice ${number}`,
          },
        });
        return invoice;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("This order already has an active invoice");
      }
      throw error;
    }
  }

  async reportPayment(
    orderId: string,
    invoiceId: string,
    file: UploadedOrderFile | undefined,
    actor: Actor,
  ) {
    if (!file) throw new BadRequestException("A payment receipt file is required");
    if (file.size > 1_048_576) {
      throw new BadRequestException("Files may not exceed 1 MB");
    }

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, orderId },
      include: { order: { select: { customerId: true, status: true } } },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (actor.role !== UserRole.CUSTOMER || invoice.order.customerId !== actor.id) {
      throw new ForbiddenException("Only the customer can report payment for this invoice");
    }
    if (invoice.status !== InvoiceStatus.ISSUED || invoice.order.status !== OrderStatus.INVOICE_ISSUED) {
      throw new ConflictException("Only an active invoice can receive a payment report");
    }

    const objectKey = this.storage.createObjectKey(orderId);
    await this.storage.put(objectKey, file);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const orderLock = await tx.workOrder.updateMany({
          where: { id: orderId, status: OrderStatus.INVOICE_ISSUED },
          data: { updatedAt: new Date() },
        });
        if (orderLock.count !== 1) throw new ConflictException("Order has already changed");

        const currentInvoice = await tx.invoice.findFirst({
          where: { id: invoiceId, orderId, status: InvoiceStatus.ISSUED },
          select: { id: true },
        });
        if (!currentInvoice) throw new ConflictException("Invoice is no longer active");

        const pendingReport = await tx.invoicePaymentReport.findFirst({
          where: { invoiceId, status: PaymentReportStatus.PENDING },
          select: { id: true },
        });
        if (pendingReport) throw new ConflictException("A payment report is already awaiting review");

        return tx.invoicePaymentReport.create({
          data: {
            invoiceId,
            submittedById: actor.id,
            objectKey,
            filename: sanitizeFilename(file.originalname),
            contentType: file.mimetype || null,
            sizeBytes: file.size,
          },
          select: paymentReportResponse,
        });
      });
    } catch (error) {
      await this.storage.delete(objectKey);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A payment report is already awaiting review");
      }
      throw error;
    }
  }

  async paymentReportFile(orderId: string, invoiceId: string, reportId: string, actor: Actor) {
    const report = await this.prisma.invoicePaymentReport.findFirst({
      where: { id: reportId, invoiceId, invoice: { orderId } },
      include: { invoice: { select: { order: { select: { customerId: true } } } } },
    });
    if (!report) throw new NotFoundException("Payment report not found");
    if (
      actor.role !== UserRole.ADMIN &&
      !(actor.role === UserRole.CUSTOMER && report.invoice.order.customerId === actor.id)
    ) {
      throw new ForbiddenException("You cannot access this payment report");
    }

    const object = await this.storage.get(report.objectKey);
    return {
      bytes: object.bytes,
      filename: report.filename,
      contentType: report.contentType ?? object.contentType ?? "application/octet-stream",
    };
  }

  async confirmPaymentReport(orderId: string, invoiceId: string, reportId: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.invoicePaymentReport.findFirst({
        where: { id: reportId, invoiceId, invoice: { orderId } },
        include: { invoice: { select: { id: true, number: true, status: true } } },
      });
      if (!report) throw new NotFoundException("Payment report not found");
      if (report.status !== PaymentReportStatus.PENDING) {
        throw new ConflictException("Payment report has already been reviewed");
      }

      const orderLock = await tx.workOrder.updateMany({
        where: { id: orderId, status: OrderStatus.INVOICE_ISSUED },
        data: { updatedAt: new Date() },
      });
      if (orderLock.count !== 1 || report.invoice.status !== InvoiceStatus.ISSUED) {
        throw new ConflictException("Invoice or order has already changed");
      }

      const now = new Date();
      const reportUpdate = await tx.invoicePaymentReport.updateMany({
        where: { id: reportId, status: PaymentReportStatus.PENDING },
        data: {
          status: PaymentReportStatus.CONFIRMED,
          reviewedById: actor.id,
          reviewedAt: now,
        },
      });
      if (reportUpdate.count !== 1) throw new ConflictException("Payment report has already been reviewed");

      const invoiceUpdate = await tx.invoice.updateMany({
        where: { id: invoiceId, orderId, status: InvoiceStatus.ISSUED },
        data: { status: InvoiceStatus.PAID, paidAt: now },
      });
      if (invoiceUpdate.count !== 1) throw new ConflictException("Invoice has already changed");

      const orderUpdate = await tx.workOrder.updateMany({
        where: { id: orderId, status: OrderStatus.INVOICE_ISSUED },
        data: { status: OrderStatus.COMPLETED, completedAt: now },
      });
      if (orderUpdate.count !== 1) throw new ConflictException("Order has already changed");

      await tx.orderStatusHistory.createMany({
        data: [
          {
            orderId,
            changedById: actor.id,
            fromStatus: OrderStatus.INVOICE_ISSUED,
            toStatus: OrderStatus.INVOICE_PAID,
            note: `Payment verified for invoice ${report.invoice.number}`,
            createdAt: now,
          },
          {
            orderId,
            changedById: actor.id,
            fromStatus: OrderStatus.INVOICE_PAID,
            toStatus: OrderStatus.COMPLETED,
            note: "Order completed after administrator verified payment",
            createdAt: new Date(now.getTime() + 1),
          },
        ],
      });

      return tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    });
  }

  async rejectPaymentReport(
    orderId: string,
    invoiceId: string,
    reportId: string,
    reason: string,
    actor: Actor,
  ) {
    if (!reason.trim()) throw new BadRequestException("A rejection reason is required");
    return this.prisma.$transaction(async (tx) => {
      const report = await tx.invoicePaymentReport.findFirst({
        where: { id: reportId, invoiceId, invoice: { orderId } },
        select: { id: true, status: true },
      });
      if (!report) throw new NotFoundException("Payment report not found");
      if (report.status !== PaymentReportStatus.PENDING) {
        throw new ConflictException("Payment report has already been reviewed");
      }

      const orderLock = await tx.workOrder.updateMany({
        where: { id: orderId, status: OrderStatus.INVOICE_ISSUED },
        data: { updatedAt: new Date() },
      });
      if (orderLock.count !== 1) throw new ConflictException("Order has already changed");

      const now = new Date();
      const update = await tx.invoicePaymentReport.updateMany({
        where: { id: reportId, status: PaymentReportStatus.PENDING },
        data: {
          status: PaymentReportStatus.REJECTED,
          reviewedById: actor.id,
          reviewedAt: now,
          reviewComment: reason.trim(),
        },
      });
      if (update.count !== 1) throw new ConflictException("Payment report has already been reviewed");

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          changedById: actor.id,
          fromStatus: OrderStatus.INVOICE_ISSUED,
          toStatus: OrderStatus.INVOICE_ISSUED,
          note: `Payment report rejected: ${reason.trim()}`,
        },
      });

      return tx.invoicePaymentReport.findUniqueOrThrow({
        where: { id: reportId },
        select: paymentReportResponse,
      });
    });
  }

  async void(orderId: string, invoiceId: string, dto: VoidInvoiceDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.workOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException("Order not found");
      if (order.status !== OrderStatus.INVOICE_ISSUED) {
        throw new ConflictException("Only an unpaid invoice can be voided");
      }
      const orderLock = await tx.workOrder.updateMany({
        where: { id: orderId, status: OrderStatus.INVOICE_ISSUED },
        data: { updatedAt: new Date() },
      });
      if (orderLock.count !== 1) throw new ConflictException("Order has already changed");
      const invoice = await tx.invoice.findFirst({
        where: { id: invoiceId, orderId, status: InvoiceStatus.ISSUED },
      });
      if (!invoice) throw new NotFoundException("Issued invoice not found");
      const pendingReport = await tx.invoicePaymentReport.findFirst({
        where: { invoiceId, status: PaymentReportStatus.PENDING },
        select: { id: true },
      });
      if (pendingReport) {
        throw new ConflictException("Review or reject the pending payment report before voiding the invoice");
      }

      const voidedAt = new Date();
      const result = await tx.invoice.updateMany({
        where: { id: invoiceId, orderId, status: InvoiceStatus.ISSUED },
        data: {
          status: InvoiceStatus.VOID,
          voidedAt,
          voidedById: actor.id,
          voidReason: dto.reason.trim(),
        },
      });
      if (result.count !== 1) throw new ConflictException("Invoice has already changed");
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          changedById: actor.id,
          fromStatus: OrderStatus.INVOICE_ISSUED,
          toStatus: OrderStatus.INVOICE_ISSUED,
          note: `Invoice ${invoice.number} voided: ${dto.reason.trim()}`,
        },
      });
      return tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    });
  }

  async pdf(orderId: string, invoiceId: string, actor: Actor): Promise<Buffer> {
    await this.orders.get(orderId, actor);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, orderId },
      include: { order: { select: { title: true } } },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");

    return new Promise<Buffer>((resolve, reject) => {
      const document = new PDFDocument({ size: "A4", margin: 56 });
      document.registerFont(
        "NotoSansLatin",
        fileURLToPath(new URL("../../node_modules/@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff", import.meta.url)),
      );
      document.registerFont(
        "NotoSansCyrillic",
        fileURLToPath(new URL("../../node_modules/@fontsource/noto-sans/files/noto-sans-cyrillic-400-normal.woff", import.meta.url)),
      );
      document.registerFont(
        "NotoSansCyrillicExt",
        fileURLToPath(new URL("../../node_modules/@fontsource/noto-sans/files/noto-sans-cyrillic-ext-400-normal.woff", import.meta.url)),
      );
      const chunks: Buffer[] = [];
      document.on("data", (chunk: Buffer) => chunks.push(chunk));
      document.on("end", () => resolve(Buffer.concat(chunks)));
      document.on("error", reject);

      document.font("NotoSansLatin").fontSize(22).text("INVOICE", { align: "center" });
      document.moveDown();
      document.fontSize(12);
      writePdfText(document, `Number: ${invoice.number}`);
      writePdfText(document, `Date: ${invoice.issuedAt.toISOString().slice(0, 10)}`);
      writePdfText(document, `Status: ${invoice.status}`);
      document.moveDown();
      document.fontSize(14);
      writePdfText(document, invoice.order.title);
      document.moveDown();
      document.fontSize(12);
      writePdfText(document, `Customer: ${invoice.customerName}`);
      writePdfText(document, `Executor: ${invoice.executorName}`);
      document.moveDown();
      writePdfText(document, `Approved hours: ${invoice.hours.toString()}`);
      writePdfText(document, `Hourly rate: ${invoice.hourlyRate.toFixed(2)} ${invoice.currency}`);
      document.moveDown();
      document.fontSize(16);
      writePdfText(document, `Total: ${invoice.amount.toFixed(2)} ${invoice.currency}`);
      if (invoice.status === InvoiceStatus.VOID) {
        document.moveDown();
        document.fontSize(12);
        writePdfText(document, `Voided: ${invoice.voidedAt?.toISOString().slice(0, 10) ?? ""}`);
        writePdfText(document, `Reason: ${invoice.voidReason ?? ""}`);
      }
      document.end();
    });
  }
}

function writePdfText(document: PDFKit.PDFDocument, text: string): void {
  const segments = text.split(/([\u0400-\u052f]+)/u).filter(Boolean);
  segments.forEach((segment, index) => {
    const font = /[\u0400-\u052f]/u.test(segment)
      ? /[\u0460-\u052f]/u.test(segment) ? "NotoSansCyrillicExt" : "NotoSansCyrillic"
      : "NotoSansLatin";
    document.font(font).text(segment, { continued: index < segments.length - 1 });
  });
}

function sanitizeFilename(filename: string): string {
  const basename = filename.replaceAll("\\", "/").split("/").at(-1)?.trim();
  return basename?.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || "payment-receipt";
}
