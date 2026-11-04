import {
  Controller,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
  UseGuards,
  Body,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiProduces, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { Roles } from "../auth/roles.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { UserRole } from "../generated/prisma/enums.js";
import { VoidInvoiceDto } from "./invoices.dto.js";
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

  @Post(":invoiceId/paid")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Mark an invoice as paid and complete its order" })
  markPaid(
    @Param("orderId") orderId: string,
    @Param("invoiceId") invoiceId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.invoices.markPaid(orderId, invoiceId, user);
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
