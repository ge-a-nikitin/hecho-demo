import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class VoidInvoiceDto {
  /**
   * Reason stored in the invoice history; the voided invoice can be reissued.
   *
   * @example "Amount was miscalculated"
   */
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(/\S/)
  reason!: string;
}

export class RejectPaymentReportDto {
  /**
   * Reason shown to the customer so the receipt can be uploaded again.
   *
   * @example "The receipt does not show the transfer date"
   */
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(/\S/)
  reason!: string;
}
