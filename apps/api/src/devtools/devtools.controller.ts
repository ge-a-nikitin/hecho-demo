import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  ParseEnumPipe,
  Post,
  Query,
  Delete,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { UserRole } from "../generated/prisma/enums.js";
import { CreateDevToolUserDto, ResetDevToolsDataDto, UpdateDevToolUserDto } from "./devtools.dto.js";
import { DevToolsGuard } from "./devtools.guard.js";
import { DevToolsService } from "./devtools.service.js";

@ApiTags("devtools")
@ApiHeader({
  name: "x-devtools-api-key",
  required: true,
  description:
    "Value of DEVTOOLS_API_KEY. The whole devtools group answers 404 until DEVTOOLS_ENABLED=true and 401 without this key.",
})
@UseGuards(DevToolsGuard)
@Controller("devtools")
export class DevToolsController {
  constructor(private readonly devTools: DevToolsService) {}

  @Post("users")
  @ApiOperation({ summary: "Create a user account for development and testing" })
  createUser(@Body() body: CreateDevToolUserDto) {
    return this.devTools.createUser(body.role, body.email, body.password);
  }

  @Get("users")
  @ApiOperation({
    summary: "List users for a selected role",
    description:
      "Filtering is exact and case-sensitive: only CUSTOMER, EXECUTOR and ADMIN are accepted, " +
      "any other value (for example \"admin\") is rejected with 400.",
  })
  @ApiQuery({
    name: "role",
    enum: UserRole,
    required: true,
    description: "Role to list: CUSTOMER, EXECUTOR or ADMIN",
  })
  listUsers(@Query("role", new ParseEnumPipe(UserRole)) role: UserRole) {
    return this.devTools.listUsers(role);
  }

  @Patch("users/:id")
  @ApiOperation({ summary: "Update a user's email/password or active state" })
  @ApiParam({
    name: "id",
    description: "Account id from GET /api/devtools/users?role=ADMIN",
    example: "cm8x2k4c50000qwer1234asdf",
  })
  updateUser(@Param("id") id: string, @Body() body: UpdateDevToolUserDto) {
    return this.devTools.updateUser(id, body);
  }

  @Post("seed")
  @ApiOperation({ summary: "Replace the deterministic development data fixture" })
  seed() {
    return this.devTools.seed();
  }

  @Delete("seed")
  @ApiOperation({ summary: "Remove only records owned by the development data fixture" })
  clearSeed() {
    return this.devTools.clearSeed();
  }

  @Post("reset")
  @HttpCode(200)
  @ApiOperation({
    summary: "Delete all data, purge stored files and recreate the administrator from ADMIN_EMAIL/ADMIN_PASSWORD",
    description:
      "Irreversible. Deletes every user with accounts and sessions, categories, orders with attachments, comments, " +
      "estimates, assignments, status history and time entries, invoices with payment reports, and the invoice " +
      "numbering; then recreates the single administrator from ADMIN_EMAIL/ADMIN_PASSWORD in the same transaction. " +
      "All sessions are revoked and invoice numbering restarts at 1. After the commit every SeaweedFS object is " +
      "deleted unless purgeFiles is false; storage failures leave the database reset and are reported in files.error.",
  })
  reset(@Body() body: ResetDevToolsDataDto) {
    return this.devTools.reset({ purgeFiles: body.purgeFiles ?? true });
  }
}
