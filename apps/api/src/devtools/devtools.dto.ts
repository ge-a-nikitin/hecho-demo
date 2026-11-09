import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";
import { UserRole } from "../generated/prisma/enums.js";

export class CreateDevToolUserDto {
  @ApiProperty({
    enum: UserRole,
    description: "Role of the created account",
    example: UserRole.CUSTOMER,
  })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiProperty({
    format: "email",
    maxLength: 254,
    description: "Login email; must be unique across all accounts",
    example: "devtools.customer@example.test",
  })
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    format: "password",
    minLength: 8,
    maxLength: 128,
    description: "Initial password; the API stores only the Better Auth hash and never returns it",
    example: "local-test-password",
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class UpdateDevToolUserDto {
  @ApiPropertyOptional({
    format: "email",
    maxLength: 254,
    description: "New login email; existing sessions of the user are revoked",
    example: "devtools.customer@example.test",
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    format: "password",
    minLength: 8,
    maxLength: 128,
    description: "New password; existing sessions of the user are revoked",
    example: "new-local-test-password",
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

  @ApiPropertyOptional({
    description: "Set to false to deactivate the account and revoke its sessions",
    example: false,
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}

/**
 * The confirmation phrase is validated server-side so a mistyped curl request or
 * an accidental repeat in Swagger cannot wipe the database.
 */
export class ResetDevToolsDataDto {
  @ApiProperty({
    enum: ["reset-all-data"],
    description: "Required confirmation phrase; any other value is rejected with 400",
    example: "reset-all-data",
  })
  @IsIn(["reset-all-data"])
  confirm!: "reset-all-data";

  @ApiPropertyOptional({
    default: true,
    description: "Delete every object in the SeaweedFS bucket; false keeps the stored files",
    example: true,
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  purgeFiles?: boolean;
}

