import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseBoolPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import { Prisma } from "../generated/prisma/client.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { Roles } from "../auth/roles.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import { CreateCategoryDto, UpdateCategoryDto } from "./category.dto.js";
import { CategoriesService } from "./categories.service.js";

const CATEGORY_ID_PARAM = {
  name: "id",
  description: "Category id from GET /api/categories?includeInactive=true",
  example: "cm8x2k4c50000qwer1234asdf",
};

@ApiTags("categories")
@ApiCookieAuth("better-auth.session_token")
@UseGuards(SessionGuard)
@Controller("categories")
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  @Roles("CUSTOMER", "EXECUTOR", "ADMIN")
  @ApiOperation({ summary: "List categories available for order creation" })
  @ApiQuery({
    name: "includeInactive",
    required: false,
    type: Boolean,
    description:
      "ADMIN only: also return categories hidden from order creation (true/false, default false)",
  })
  list(
    @CurrentUser() user: { role: string },
    @Query("includeInactive", new ParseBoolPipe({ optional: true })) includeInactive?: boolean,
  ) {
    if (includeInactive && user.role !== "ADMIN") {
      throw new ForbiddenException("Only administrators can list inactive categories");
    }
    return this.categories.list(includeInactive ?? false);
  }

  @Post()
  @Roles("ADMIN")
  @ApiOperation({ summary: "Create a work category" })
  async create(@Body() body: CreateCategoryDto, @CurrentUser() user: { id: string }) {
    try {
      return await this.categories.create(body.name, user.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A category with this name already exists");
      }
      throw error;
    }
  }

  @Patch(":id")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Rename or deactivate a category" })
  @ApiParam(CATEGORY_ID_PARAM)
  async update(
    @Param("id") id: string,
    @Body() body: UpdateCategoryDto,
  ) {
    try {
      return await this.categories.rename(id, body.name);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new NotFoundException("Category not found");
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A category with this name already exists");
      }
      throw error;
    }
  }

  @Patch(":id/active")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Set category availability" })
  @ApiParam(CATEGORY_ID_PARAM)
  @ApiQuery({
    name: "active",
    required: true,
    type: Boolean,
    description: "true makes the category selectable in order creation, false hides it",
  })
  async setActive(@Param("id") id: string, @Query("active", ParseBoolPipe) active: boolean) {
    try {
      return await this.categories.setActive(id, active);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new NotFoundException("Category not found");
      }
      throw error;
    }
  }
}
