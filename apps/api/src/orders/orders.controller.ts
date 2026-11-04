import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { Roles } from "../auth/roles.decorator.js";
import { SessionGuard } from "../auth/session.guard.js";
import type { UserRole } from "../generated/prisma/enums.js";
import { CancelOrderDto } from "./files.dto.js";
import {
  AssignOrderDto,
  CreateOrderCommentDto,
  CreateOrderDto,
  DeclineAssignmentDto,
  ProposeEstimateDto,
  RevisionRequestDto,
  RespondToEstimateDto,
  UpdateDraftOrderDto,
  WorkTimeDto,
} from "./orders.dto.js";
import { OrdersService } from "./orders.service.js";

type RequestUser = { id: string; role: UserRole };

@ApiTags("orders")
@ApiCookieAuth("better-auth.session_token")
@UseGuards(SessionGuard)
@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @Roles("CUSTOMER", "EXECUTOR", "ADMIN")
  @ApiOperation({ summary: "List orders visible to the current user" })
  list(@CurrentUser() user: RequestUser) {
    return this.orders.list(user);
  }

  @Get(":id")
  @Roles("CUSTOMER", "EXECUTOR", "ADMIN")
  @ApiOperation({ summary: "Get an order visible to the current user" })
  get(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.orders.get(id, user);
  }

  @Post()
  @Roles("CUSTOMER")
  @ApiOperation({ summary: "Create an order draft" })
  create(@Body() body: CreateOrderDto, @CurrentUser() user: RequestUser) {
    return this.orders.create(body, user);
  }

  @Patch(":id")
  @Roles("CUSTOMER")
  @ApiOperation({ summary: "Edit an order draft" })
  updateDraft(
    @Param("id") id: string,
    @Body() body: UpdateDraftOrderDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orders.updateDraft(id, body, user);
  }

  @Post(":id/submit")
  @Roles("CUSTOMER")
  @ApiOperation({ summary: "Submit an order draft for assignment" })
  submit(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.orders.submit(id, user);
  }

  @Post(":id/claim")
  @Roles("EXECUTOR")
  @ApiOperation({ summary: "Atomically claim an order from the pool" })
  claim(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.orders.claim(id, user);
  }

  @Post(":id/decline")
  @Roles("EXECUTOR")
  @ApiOperation({ summary: "Decline an assigned order before work starts" })
  decline(
    @Param("id") id: string,
    @Body() body: DeclineAssignmentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orders.decline(id, body.comment, user);
  }

  @Post(":id/estimate")
  @Roles("EXECUTOR")
  @ApiOperation({ summary: "Propose hours and price for an assigned order" })
  proposeEstimate(
    @Param("id") id: string,
    @Body() body: ProposeEstimateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orders.proposeEstimate(id, body.hours, user);
  }

  @Post(":id/estimates/:estimateId/respond")
  @Roles("CUSTOMER")
  @ApiOperation({ summary: "Accept or reject an executor estimate" })
  respondToEstimate(
    @Param("id") orderId: string,
    @Param("estimateId") estimateId: string,
    @Body() body: RespondToEstimateDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orders.respondToEstimate(orderId, estimateId, body, user);
  }

  @Post(":id/time")
  @Roles("EXECUTOR")
  @ApiOperation({ summary: "Record or update total work time" })
  saveWorkTime(
    @Param("id") id: string,
    @Body() body: WorkTimeDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orders.saveWorkTime(id, body, user);
  }

  @Post(":id/submit-review")
  @Roles("EXECUTOR")
  @ApiOperation({ summary: "Submit completed work for customer review" })
  submitForReview(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.orders.submitForReview(id, user);
  }

  @Post(":id/request-revision")
  @Roles("CUSTOMER")
  @ApiOperation({ summary: "Return submitted work for revisions" })
  requestRevision(
    @Param("id") id: string,
    @Body() body: RevisionRequestDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orders.requestRevision(id, body, user);
  }

  @Post(":id/resume-revisions")
  @Roles("EXECUTOR")
  @ApiOperation({ summary: "Resume work on requested revisions" })
  resumeRevisions(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.orders.resumeRevisions(id, user);
  }

  @Post(":id/accept")
  @Roles("CUSTOMER")
  @ApiOperation({ summary: "Accept submitted work" })
  acceptWork(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.orders.acceptWork(id, user);
  }

  @Post(":id/comments")
  @Roles("CUSTOMER", "EXECUTOR", "ADMIN")
  @ApiOperation({ summary: "Add a comment to an order" })
  addComment(
    @Param("id") id: string,
    @Body() body: CreateOrderCommentDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orders.addComment(id, body, user);
  }

  @Post(":id/cancel")
  @Roles("CUSTOMER", "ADMIN")
  @ApiOperation({ summary: "Cancel an order according to its current state" })
  cancel(
    @Param("id") id: string,
    @Body() body: CancelOrderDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orders.cancel(id, body.reason, user);
  }

  @Post(":id/assign")
  @Roles("ADMIN")
  @ApiOperation({ summary: "Assign an order to an executor" })
  assign(
    @Param("id") id: string,
    @Body() body: AssignOrderDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.orders.assign(id, body.executorId, user);
  }
}
