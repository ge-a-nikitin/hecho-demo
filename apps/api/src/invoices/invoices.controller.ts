import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { Roles } from "../auth/roles.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { UserRole } from "../generated/prisma/enums.js";
import type { UploadedOrderFile } from "../orders/order-files.service.js";
import { RejectPaymentReportDto, VoidInvoiceDto } from "./invoices.dto.js";
import { InvoicesService } from "./invoices.service.js";

type RequestUser = { id: string; role: UserRole };

@ApiTags("invoices")
@ApiCookieAuth("better-auth.session_token")
@UseGuards(SessionGuard)
@Controller("orders/:orderId/invoices")
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post()
  @Roles("ADMIN")
  @ApiOperation({ summary: "Issue an invoice for accepted work" })
  issue(@Param("orderId") orderId: string, @CurrentUser() user: RequestUser) {
    return this.invoices.issue(orderId, user);
  }

  @Post(":invoiceId/payment-reports")
  @Roles("CUSTOMER")
  @ApiOperation({ summary: "Report invoice payment with a receipt file (maximum 1 MB)" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
      required: ["file"],
    },
  })
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 1_048_576 } }))
  reportPayment(
    @Param("orderId") orderId: string,
    @Param("invoiceId") invoiceId: string,
    @UploadedFile() file: UploadedOrderFile,
    @CurrentUser() user: RequestUser,
  ) {
    return this.invoices.reportPayment(orderId, invoiceId, file, user);
  }

  @Get(":invoiceId/payment-reports/:reportId/file")
  @Roles("CUSTOMER", "ADMIN")
  @ApiOperation({ summary: "Download an invoice payment receipt" })
  async paymentReportFile(
    @Param("orderId") orderId: string,
    @Param("invoiceId") invoiceId: string,
    @Param("reportId") reportId: string,
    @CurrentUser() user: RequestUser,
  ) {
    const file = await this.invoices.paymentReportFile(orderId, invoiceId, reportId, user);
    const encodedFilename = encodeURIComponent(file.filename);
    return new StreamableFile(file.bytes, {
      type: file.contentType,
      disposition: `attachment; filename*=UTF-8''${encodedFilename}`,
    });
  }

  @Post(":invoiceId/payment-reports/:reportId/confirm")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Confirm an invoice payment after verifying receipt and funds" })
  confirmPaymentReport(
    @Param("orderId") orderId: string,
    @Param("invoiceId") invoiceId: string,
    @Param("reportId") reportId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.invoices.confirmPaymentReport(orderId, invoiceId, reportId, user);
  }

  @Post(":invoiceId/payment-reports/:reportId/reject")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Reject an invalid payment report so the customer can resubmit" })
  rejectPaymentReport(
    @Param("orderId") orderId: string,
    @Param("invoiceId") invoiceId: string,
    @Param("reportId") reportId: string,
    @Body() body: RejectPaymentReportDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.invoices.rejectPaymentReport(orderId, invoiceId, reportId, body.reason, user);
  }

  @Post(":invoiceId/void")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Void an unpaid invoice so it can be reissued" })
  void(
    @Param("orderId") orderId: string,
    @Param("invoiceId") invoiceId: string,
    @Body() body: VoidInvoiceDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.invoices.void(orderId, invoiceId, body, user);
  }

  @Get(":invoiceId/pdf")
  @Roles("CUSTOMER", "EXECUTOR", "ADMIN")
  @ApiOperation({ summary: "Download invoice PDF" })
  @ApiProduces("application/pdf")
  async pdf(
    @Param("orderId") orderId: string,
    @Param("invoiceId") invoiceId: string,
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const pdf = await this.invoices.pdf(orderId, invoiceId, user);
    response.setHeader("Content-Disposition", `attachment; filename="${invoiceId}.pdf"`);
    return new StreamableFile(pdf, { type: "application/pdf" });
  }
}
