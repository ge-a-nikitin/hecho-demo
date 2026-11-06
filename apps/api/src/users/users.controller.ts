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
import { CurrentUser } from "../auth/current-user.decorator.js";
import { Roles } from "../auth/roles.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import {
  CreateExecutorDto,
  ResetPasswordDto,
  UpdateExecutorDto,
  UpdateHourlyRateDto,
  UpdateOwnProfileDto,
} from "./users.dto.js";
import { UsersService } from "./users.service.js";

@ApiTags("users")
@ApiCookieAuth("better-auth.session_token")
@UseGuards(SessionGuard)
@Roles("ADMIN")
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get("me")
  @Roles("CUSTOMER", "EXECUTOR", "ADMIN")
  @ApiOperation({ summary: "Get the current user's profile" })
  getOwnProfile(@CurrentUser() user: { id: string }) {
    return this.users.getOwnProfile(user.id);
  }

  @Patch("me/profile")
  @Roles("CUSTOMER", "EXECUTOR", "ADMIN")
  @ApiOperation({ summary: "Update the current user's name or email after password confirmation" })
  updateOwnProfile(
    @Body() body: UpdateOwnProfileDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.users.updateOwnProfile(user.id, body);
  }

  @Patch("me/hourly-rate")
  @Roles("EXECUTOR")
  @ApiOperation({ summary: "Set the current executor's hourly rate" })
  updateOwnHourlyRate(
    @Body() body: UpdateHourlyRateDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.users.updateOwnHourlyRate(user.id, body.hourlyRate);
  }

  @Get("executors/available")
  @Roles("CUSTOMER", "ADMIN")
  @ApiOperation({ summary: "List active executors available for customer selection" })
  listAvailableExecutors() {
    return this.users.listAvailableExecutors();
  }

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
  @ApiOperation({ summary: "Update an executor's display name" })
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
