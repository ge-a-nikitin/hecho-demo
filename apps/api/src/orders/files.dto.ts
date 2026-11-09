import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CancelOrderDto {
  /**
   * Optional cancellation reason stored in the order status history.
   *
   * @example "The customer no longer needs the visit"
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

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
