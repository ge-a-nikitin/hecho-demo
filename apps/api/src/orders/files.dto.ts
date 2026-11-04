import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CancelOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class VoidInvoiceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  reason!: string;
}
