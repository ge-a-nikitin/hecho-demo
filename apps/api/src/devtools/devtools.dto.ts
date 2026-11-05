import { IsEmail, IsEnum, IsString, MaxLength, MinLength } from "class-validator";
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
