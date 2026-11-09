import { IsEmail, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";
import { Type } from "class-transformer";

export class CreateExecutorDto {
  /**
   * Executor display name shown to customers and in orders.
   *
   * @example "Jane Doe"
   */
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  name!: string;

  /**
   * Login email; must be unique across all accounts.
   *
   * @example "jane.doe@example.test"
   */
  @IsEmail()
  @MaxLength(254)
  email!: string;

  /**
   * Initial password; the API stores only the Better Auth hash and never returns it.
   *
   * @example "Password123!"
   */
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class ResetPasswordDto {
  /**
   * New password; existing sessions of the account are revoked.
   *
   * @example "NewPassword123!"
   */
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class UpdateExecutorDto {
  /**
   * New display name; omit to keep the current one.
   *
   * @example "Jane R. Doe"
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  name?: string;
}

export class UpdateHourlyRateDto {
  /**
   * Hourly rate in the invoice currency, up to 4 decimal places (0.0001 to 1000000).
   *
   * @example 45
   */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(1_000_000)
  hourlyRate!: number;
}

export class UpdateOwnProfileDto {
  /**
   * New display name; omit to keep the current one.
   *
   * @example "Jane R. Doe"
   */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/)
  name?: string;

  /**
   * New login email; omit to keep the current one.
   *
   * @example "jane.doe@example.test"
   */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  /**
   * Current password, required to confirm the change.
   *
   * @example "Password123!"
   */
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;
}
