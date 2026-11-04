import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/roles.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import { CreateExecutorDto, ResetPasswordDto, UpdateExecutorDto } from "./users.dto.js";
import { UsersService } from "./users.service.js";

@ApiTags("users")
@ApiCookieAuth("better-auth.session_token")
@UseGuards(SessionGuard)
@Roles("ADMIN")
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("executors")
  @ApiOperation({ summary: "List executor accounts" })
  listExecutors(
    @Query("includeInactive", new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
  ) {
    return this.users.listExecutors(includeInactive ?? false);
  }

  @Get("customers")
  @ApiOperation({ summary: "List customer accounts" })
  listCustomers(
    @Query("includeInactive", new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
  ) {
    return this.users.listCustomers(includeInactive ?? false);
  }

  @Post("executors")
  @ApiOperation({ summary: "Create an executor account with an initial password" })
  createExecutor(@Body() body: CreateExecutorDto) {
    return this.users.createExecutor(body);
  }

  @Patch("executors/:id")
  @ApiOperation({ summary: "Update executor profile and hourly rate" })
  updateExecutor(@Param("id") id: string, @Body() body: UpdateExecutorDto) {
    return this.users.updateExecutor(id, body);
  }

  @Post("executors/:id/reset-password")
  @ApiOperation({ summary: "Set a new executor password and revoke sessions" })
  resetPassword(@Param("id") id: string, @Body() body: ResetPasswordDto) {
    return this.users.resetPassword(id, body.password);
  }

  @Post(":id/reset-password")
  @ApiOperation({ summary: "Reset a customer or executor password and revoke sessions" })
  resetEndUserPassword(@Param("id") id: string, @Body() body: ResetPasswordDto) {
    return this.users.resetPassword(id, body.password);
  }

  @Patch(":id/active")
  @ApiOperation({ summary: "Activate or deactivate a customer or executor" })
  setActive(
    @Param("id") id: string,
    @Query("active", ParseBoolPipe) active: boolean,
  ) {
    return this.users.setActive(id, active);
  }
}
