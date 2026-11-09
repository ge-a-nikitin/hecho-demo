import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { UserRole } from "../generated/prisma/enums.js";

export class CreateDevToolUserDto {
  @IsEnum(UserRole)
  role!: UserRole;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class UpdateDevToolUserDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

/**
 * The confirmation phrase is validated server-side so a mistyped curl request or
 * an accidental repeat in Swagger cannot wipe the database.
 */
export class ResetDevToolsDataDto {
  @IsIn(["reset-all-data"])
  confirm!: "reset-all-data";

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  purgeFiles?: boolean;
}

