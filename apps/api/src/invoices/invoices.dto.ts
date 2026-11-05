import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class VoidInvoiceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(/\S/)
  reason!: string;
}

export class RejectPaymentReportDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(/\S/)
  reason!: string;
}
