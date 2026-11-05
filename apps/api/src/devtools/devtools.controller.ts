import {
  Body,
  Controller,
  Get,
  ParseEnumPipe,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "../generated/prisma/enums.js";
import { CreateDevToolUserDto } from "./devtools.dto.js";
import { DevToolsGuard } from "./devtools.guard.js";
import { DevToolsService } from "./devtools.service.js";

@ApiTags("devtools")
@ApiHeader({ name: "x-devtools-api-key", required: true })
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
  @ApiOperation({ summary: "List users for a selected role" })
  listUsers(@Query("role", new ParseEnumPipe(UserRole)) role: UserRole) {
    return this.devTools.listUsers(role);
  }
}
