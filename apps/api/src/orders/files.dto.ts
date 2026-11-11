import { IsOptional, IsString, MaxLength } from "class-validator";

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

