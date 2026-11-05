import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client.js";
import {
  AssignmentOutcome,
  EstimateStatus,
  OrderStatus,
  UserRole,
} from "../generated/prisma/enums.js";
import { PrismaService } from "../database/prisma.service.js";
import type {
  CreateOrderDto,
  CreateOrderCommentDto,
  DeclineAssignmentDto,
  RevisionRequestDto,
  RespondToEstimateDto,
  UpdateDraftOrderDto,
  WorkTimeDto,
} from "./orders.dto.js";

const orderInclude = {
  category: true,
  customer: { select: { id: true, name: true } },
  executor: { select: { id: true, name: true } },
  estimates: { orderBy: { proposedAt: "desc" as const } },
  assignments: { orderBy: { assignedAt: "desc" as const } },
  statusHistory: {
    orderBy: { createdAt: "asc" as const },
    include: { changedBy: { select: { id: true, name: true } } },
  },
  attachments: { orderBy: { createdAt: "asc" as const } },
  comments: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { id: true, name: true } } },
  },
  timeEntry: true,
  invoices: { orderBy: { createdAt: "asc" as const } },
};

const orderIncludeWithPaymentReports = {
  ...orderInclude,
  invoices: {
    orderBy: { createdAt: "asc" as const },
    include: {
      paymentReports: {
        orderBy: { submittedAt: "desc" as const },
        select: {
          id: true,
          filename: true,
          sizeBytes: true,
          status: true,
          reviewComment: true,
          submittedAt: true,
          reviewedAt: true,
        },
      },
    },
  },
};

type Actor = { id: string; role: UserRole };

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: Actor) {
    let where: Prisma.WorkOrderWhereInput;
    switch (actor.role) {
      case UserRole.ADMIN:
        where = {};
        break;
      case UserRole.CUSTOMER:
        where = { customerId: actor.id };
        break;
      case UserRole.EXECUTOR:
        where = {
          OR: [
            { executorId: actor.id },
            { status: OrderStatus.WAITING_DISTRIBUTION, executorId: null },
          ],
        };
        break;
      default:
        throw new ForbiddenException();
    }

    return this.prisma.workOrder.findMany({
      where,
      include: actor.role === UserRole.EXECUTOR ? orderInclude : orderIncludeWithPaymentReports,
      orderBy: { createdAt: "desc" },
    });
  }

  async get(id: string, actor: Actor) {
    const order = await this.prisma.workOrder.findUnique({
      where: { id },
      include: actor.role === UserRole.EXECUTOR ? orderInclude : orderIncludeWithPaymentReports,
    });
    if (!order) throw new NotFoundException("Order not found");
    if (
      actor.role === UserRole.CUSTOMER && order.customerId !== actor.id ||
      actor.role === UserRole.EXECUTOR &&
        order.executorId !== actor.id &&
        !(order.status === OrderStatus.WAITING_DISTRIBUTION && order.executorId === null)
    ) {
      throw new ForbiddenException("You cannot access this order");
    }
    return order;
  }

  async create(dto: CreateOrderDto, actor: Actor) {
    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, isActive: true },
      select: { id: true },
    });
    if (!category) throw new BadRequestException("Category is not available");

    return this.prisma.$transaction(async (tx) => {
      if (dto.executorId) await this.lockActiveExecutor(tx, dto.executorId);
      return tx.workOrder.create({
        data: {
          title: dto.title.trim(),
          description: dto.description.trim(),
          categoryId: dto.categoryId,
          customerId: actor.id,
          executorId: dto.executorId,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          location: dto.location?.trim() || null,
          assignments: dto.executorId
            ? {
                create: {
                  executorId: dto.executorId,
                  outcome: AssignmentOutcome.ACTIVE,
                },
              }
            : undefined,
          statusHistory: {
            create: {
              changedById: actor.id,
              fromStatus: null,
              toStatus: OrderStatus.NEW,
            },
          },
        },
        include: orderInclude,
      });
    });
  }

  async updateDraft(id: string, dto: UpdateDraftOrderDto, actor: Actor) {
    const order = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.customerId !== actor.id) throw new ForbiddenException();
    if (order.status !== OrderStatus.NEW) {
      throw new ConflictException("Only a new draft can be edited");
    }

    if (dto.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, isActive: true },
        select: { id: true },
      });
      if (!category) throw new BadRequestException("Category is not available");
    }
    const nextExecutorId = dto.executorId === undefined ? order.executorId : dto.executorId;
    return this.prisma.$transaction(async (tx) => {
      if (nextExecutorId && order.executorId !== nextExecutorId) {
        await this.lockActiveExecutor(tx, nextExecutorId);
      }
      if (order.executorId && order.executorId !== nextExecutorId) {
        await tx.orderAssignment.updateMany({
          where: { orderId: id, executorId: order.executorId, outcome: AssignmentOutcome.ACTIVE },
          data: { outcome: AssignmentOutcome.RELEASED, endedAt: new Date() },
        });
      }
      if (nextExecutorId && order.executorId !== nextExecutorId) {
        await tx.orderAssignment.create({
          data: { orderId: id, executorId: nextExecutorId, outcome: AssignmentOutcome.ACTIVE },
        });
      }

      return tx.workOrder.update({
        where: { id, status: OrderStatus.NEW },
        data: {
          title: dto.title?.trim(),
          description: dto.description?.trim(),
          categoryId: dto.categoryId,
          executorId: nextExecutorId,
          dueAt: dto.dueAt === undefined ? undefined : dto.dueAt ? new Date(dto.dueAt) : null,
          location: dto.location === undefined ? undefined : dto.location?.trim() || null,
        },
        include: orderInclude,
      });
    });
  }

  async submit(id: string, actor: Actor) {
    const order = await this.prisma.workOrder.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("Order not found");
    if (order.customerId !== actor.id) throw new ForbiddenException();
    if (order.status !== OrderStatus.NEW) {
      throw new ConflictException("Only a new draft can be submitted");
    }

    const status = order.executorId ? OrderStatus.ASSIGNED : OrderStatus.WAITING_DISTRIBUTION;
    return this.prisma.$transaction(async (tx) => {
      const update = await tx.workOrder.updateMany({
        where: { id, status: OrderStatus.NEW },
        data: { status, submittedAt: new Date() },
      });
      if (update.count !== 1) throw new ConflictException("Order has already changed");
      await tx.orderStatusHistory.create({
        data: { orderId: id, changedById: actor.id, fromStatus: OrderStatus.NEW, toStatus: status },
      });
      return tx.workOrder.findUniqueOrThrow({ where: { id }, include: orderInclude });
    });
  }

  async assign(id: string, executorId: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockActiveExecutor(tx, executorId);
      const order = await tx.workOrder.findUnique({ where: { id } });
      if (!order) throw new NotFoundException("Order not found");
      const isUnassignedOrder =
        order.status === OrderStatus.WAITING_DISTRIBUTION && order.executorId === null;
      const isReassignment = order.status === OrderStatus.ASSIGNED && order.executorId !== null;
      if (!isUnassignedOrder && !isReassignment) {
        throw new ConflictException("Only waiting or assigned orders can be assigned");
      }
      if (order.executorId === executorId) {
        throw new ConflictException("Order is already assigned to this executor");
      }

      const update = await tx.workOrder.updateMany({
        where: { id, status: order.status, executorId: order.executorId },
        data: { executorId, status: OrderStatus.ASSIGNED },
      });
      if (update.count !== 1) throw new ConflictException("Order has already been assigned");
      if (order.executorId) {
        const endedAssignment = await tx.orderAssignment.updateMany({
          where: {
            orderId: id,
            executorId: order.executorId,
            outcome: AssignmentOutcome.ACTIVE,
          },
          data: { outcome: AssignmentOutcome.REASSIGNED, endedAt: new Date() },
        });
        if (endedAssignment.count !== 1) {
          throw new ConflictException("Active assignment history is inconsistent");
        }
        await tx.orderEstimate.updateMany({
          where: { orderId: id, status: EstimateStatus.PENDING },
          data: {
            status: EstimateStatus.WITHDRAWN,
            responseComment: "Withdrawn because the order was reassigned by an administrator",
            respondedAt: new Date(),
          },
        });
      }
      await tx.orderAssignment.create({
        data: { orderId: id, executorId, assignedById: actor.id, outcome: AssignmentOutcome.ACTIVE },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          changedById: actor.id,
          fromStatus: order.status,
          toStatus: OrderStatus.ASSIGNED,
          note: order.executorId ? "Executor reassigned by administrator" : null,
        },
      });
      return tx.workOrder.findUniqueOrThrow({ where: { id }, include: orderInclude });
    });
  }

  async claim(id: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      await this.lockActiveExecutor(tx, actor.id);
      const update = await tx.workOrder.updateMany({
        where: { id, status: OrderStatus.WAITING_DISTRIBUTION, executorId: null },
        data: { executorId: actor.id, status: OrderStatus.ASSIGNED },
      });
      if (update.count !== 1) {
        const exists = await tx.workOrder.findUnique({ where: { id }, select: { id: true } });
        if (!exists) throw new NotFoundException("Order not found");
        throw new ConflictException("Order is no longer available in the pool");
      }
      await tx.orderAssignment.create({
        data: { orderId: id, executorId: actor.id, outcome: AssignmentOutcome.ACTIVE },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          changedById: actor.id,
          fromStatus: OrderStatus.WAITING_DISTRIBUTION,
          toStatus: OrderStatus.ASSIGNED,
        },
      });
      return tx.workOrder.findUniqueOrThrow({ where: { id }, include: orderInclude });
    });
  }

  async decline(id: string, comment: string | undefined, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const update = await tx.workOrder.updateMany({
        where: { id, status: OrderStatus.ASSIGNED, executorId: actor.id },
        data: { executorId: null, status: OrderStatus.WAITING_DISTRIBUTION },
      });
      if (update.count !== 1) {
        const order = await tx.workOrder.findUnique({ where: { id }, select: { id: true } });
        if (!order) throw new NotFoundException("Order not found");
        throw new ConflictException("Only your assigned order can be declined before work starts");
      }
      const assignment = await tx.orderAssignment.updateMany({
        where: { orderId: id, executorId: actor.id, outcome: AssignmentOutcome.ACTIVE },
        data: { outcome: AssignmentOutcome.DECLINED, endedAt: new Date() },
      });
      if (assignment.count !== 1) {
        throw new ConflictException("Active assignment history is inconsistent");
      }
      await tx.orderEstimate.updateMany({
        where: { orderId: id, status: EstimateStatus.PENDING },
        data: {
          status: EstimateStatus.WITHDRAWN,
          responseComment: comment?.trim() || "Withdrawn because the executor declined the assignment",
          respondedAt: new Date(),
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          changedById: actor.id,
          fromStatus: OrderStatus.ASSIGNED,
          toStatus: OrderStatus.WAITING_DISTRIBUTION,
          note: comment?.trim() || null,
        },
      });
      return tx.workOrder.findUniqueOrThrow({ where: { id }, include: orderInclude });
    });
  }

  async proposeEstimate(id: string, hours: number, actor: Actor) {
    const executor = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { hourlyRate: true },
    });
    if (!executor?.hourlyRate || executor.hourlyRate.lessThanOrEqualTo(0)) {
      throw new BadRequestException("Set a positive hourly rate before proposing an estimate");
    }

    const hourlyRate = executor.hourlyRate;
    const proposedHours = new Prisma.Decimal(hours);
    const amount = proposedHours.mul(hourlyRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const orderUpdate = await tx.workOrder.updateMany({
          where: { id, status: OrderStatus.ASSIGNED, executorId: actor.id },
          data: { updatedAt: new Date() },
        });
        if (orderUpdate.count !== 1) {
          const exists = await tx.workOrder.findUnique({ where: { id }, select: { id: true } });
          if (!exists) throw new NotFoundException("Order not found");
          throw new ConflictException("Only the assigned executor can estimate an assigned order");
        }
        return tx.orderEstimate.create({
          data: {
            orderId: id,
            proposedById: actor.id,
            hours: proposedHours,
            hourlyRate,
            amount,
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("An estimate is already waiting for customer response");
      }
      throw error;
    }
  }

  async respondToEstimate(
    orderId: string,
    estimateId: string,
    dto: RespondToEstimateDto,
    actor: Actor,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.workOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException("Order not found");
      if (order.customerId !== actor.id) throw new ForbiddenException();
      if (order.status !== OrderStatus.ASSIGNED || !order.executorId) {
        throw new ConflictException("This order is not awaiting an estimate response");
      }

      const lockOrder = await tx.workOrder.updateMany({
        where: {
          id: orderId,
          status: OrderStatus.ASSIGNED,
          executorId: order.executorId,
        },
        data: { updatedAt: new Date() },
      });
      if (lockOrder.count !== 1) throw new ConflictException("Order has already changed");

      const estimate = await tx.orderEstimate.findFirst({
        where: {
          id: estimateId,
          orderId,
          proposedById: order.executorId,
          status: EstimateStatus.PENDING,
        },
      });
      if (!estimate) throw new NotFoundException("Pending estimate not found");

      const nextStatus = dto.accepted
        ? OrderStatus.IN_PROGRESS
        : OrderStatus.WAITING_DISTRIBUTION;
      const estimateUpdate = await tx.orderEstimate.updateMany({
        where: { id: estimate.id, status: EstimateStatus.PENDING },
        data: {
          status: dto.accepted ? EstimateStatus.ACCEPTED : EstimateStatus.REJECTED,
          responseComment: dto.comment?.trim() || null,
          respondedAt: new Date(),
        },
      });
      if (estimateUpdate.count !== 1) {
        throw new ConflictException("Estimate has already received a response");
      }

      const orderUpdate = await tx.workOrder.updateMany({
        where: {
          id: orderId,
          status: OrderStatus.ASSIGNED,
          executorId: order.executorId,
        },
        data: dto.accepted
          ? {
              status: nextStatus,
              approvedHours: estimate.hours,
              approvedHourlyRate: estimate.hourlyRate,
              approvedAmount: estimate.amount,
            }
          : { status: nextStatus, executorId: null },
      });
      if (orderUpdate.count !== 1) throw new ConflictException("Order has already changed");

      if (!dto.accepted) {
        const assignmentUpdate = await tx.orderAssignment.updateMany({
          where: {
            orderId,
            executorId: order.executorId,
            outcome: AssignmentOutcome.ACTIVE,
          },
          data: { outcome: AssignmentOutcome.RELEASED, endedAt: new Date() },
        });
        if (assignmentUpdate.count !== 1) {
          throw new ConflictException("Active assignment history is inconsistent");
        }
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          changedById: actor.id,
          fromStatus: OrderStatus.ASSIGNED,
          toStatus: nextStatus,
          note: dto.comment?.trim() || null,
        },
      });

      return {
        estimate: await tx.orderEstimate.findUniqueOrThrow({ where: { id: estimate.id } }),
        order: await tx.workOrder.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude }),
      };
    });
  }

  async saveWorkTime(orderId: string, dto: WorkTimeDto, actor: Actor) {
    const update = await this.prisma.workOrder.updateMany({
      where: { id: orderId, executorId: actor.id, status: OrderStatus.IN_PROGRESS },
      data: { updatedAt: new Date() },
    });
    if (update.count !== 1) {
      const order = await this.prisma.workOrder.findUnique({
        where: { id: orderId },
        select: { id: true },
      });
      if (!order) throw new NotFoundException("Order not found");
      throw new ConflictException("Only the assigned executor can record time while work is in progress");
    }

    return this.prisma.workTimeEntry.upsert({
      where: { orderId },
      create: {
        orderId,
        minutes: dto.minutes,
        comment: dto.comment?.trim() || null,
      },
      update: {
        minutes: dto.minutes,
        comment: dto.comment?.trim() || null,
      },
    });
  }

  async submitForReview(orderId: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const update = await tx.workOrder.updateMany({
        where: { id: orderId, executorId: actor.id, status: OrderStatus.IN_PROGRESS },
        data: { status: OrderStatus.ON_REVIEW },
      });
      if (update.count !== 1) {
        const order = await tx.workOrder.findUnique({ where: { id: orderId }, select: { id: true } });
        if (!order) throw new NotFoundException("Order not found");
        throw new ConflictException("Only the assigned executor can submit work in progress for review");
      }
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          changedById: actor.id,
          fromStatus: OrderStatus.IN_PROGRESS,
          toStatus: OrderStatus.ON_REVIEW,
        },
      });
      return tx.workOrder.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    });
  }

  async requestRevision(orderId: string, dto: RevisionRequestDto, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.workOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException("Order not found");
      if (order.customerId !== actor.id) throw new ForbiddenException();
      if (order.status !== OrderStatus.ON_REVIEW || order.acceptedAt) {
        throw new ConflictException("Only work awaiting review can be returned for revision");
      }

      const update = await tx.workOrder.updateMany({
        where: { id: orderId, status: OrderStatus.ON_REVIEW, acceptedAt: null },
        data: { status: OrderStatus.NEEDS_REVISION },
      });
      if (update.count !== 1) throw new ConflictException("Order has already changed");

      const comment = dto.comment.trim();
      await tx.orderComment.create({
        data: { orderId, authorId: actor.id, content: comment },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          changedById: actor.id,
          fromStatus: OrderStatus.ON_REVIEW,
          toStatus: OrderStatus.NEEDS_REVISION,
          note: comment,
        },
      });
      return tx.workOrder.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    });
  }

  async resumeRevisions(orderId: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const update = await tx.workOrder.updateMany({
        where: {
          id: orderId,
          executorId: actor.id,
          status: OrderStatus.NEEDS_REVISION,
          acceptedAt: null,
        },
        data: { status: OrderStatus.IN_PROGRESS },
      });
      if (update.count !== 1) {
        const order = await tx.workOrder.findUnique({ where: { id: orderId }, select: { id: true } });
        if (!order) throw new NotFoundException("Order not found");
        throw new ConflictException("Only the assigned executor can start requested revisions");
      }
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          changedById: actor.id,
          fromStatus: OrderStatus.NEEDS_REVISION,
          toStatus: OrderStatus.IN_PROGRESS,
        },
      });
      return tx.workOrder.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    });
  }

  async acceptWork(orderId: string, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.workOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException("Order not found");
      if (order.customerId !== actor.id) throw new ForbiddenException();
      if (order.status !== OrderStatus.ON_REVIEW || order.acceptedAt) {
        throw new ConflictException("Only work awaiting review can be accepted");
      }

      const acceptedAt = new Date();
      const update = await tx.workOrder.updateMany({
        where: { id: orderId, status: OrderStatus.ON_REVIEW, acceptedAt: null },
        data: { acceptedAt },
      });
      if (update.count !== 1) throw new ConflictException("Order has already changed");
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          changedById: actor.id,
          fromStatus: OrderStatus.ON_REVIEW,
          toStatus: OrderStatus.ON_REVIEW,
          note: "Work accepted by customer",
        },
      });
      return tx.workOrder.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    });
  }

  async addComment(orderId: string, dto: CreateOrderCommentDto, actor: Actor) {
    const order = await this.prisma.workOrder.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true, executorId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (
      actor.role !== UserRole.ADMIN &&
      actor.id !== order.customerId &&
      actor.id !== order.executorId
    ) {
      throw new ForbiddenException("Only order participants can comment");
    }
    return this.prisma.orderComment.create({
      data: {
        orderId,
        authorId: actor.id,
        content: dto.content.trim(),
      },
    });
  }

  async cancel(orderId: string, reason: string | undefined, actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.workOrder.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException("Order not found");
      const nonCancellableStatuses = new Set<OrderStatus>([
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED,
        OrderStatus.INVOICE_ISSUED,
        OrderStatus.INVOICE_PAID,
      ]);
      if (nonCancellableStatuses.has(order.status)) {
        throw new ConflictException("This order cannot be cancelled in its current state");
      }

      const notStartedStatuses = new Set<OrderStatus>([
        OrderStatus.NEW,
        OrderStatus.WAITING_DISTRIBUTION,
        OrderStatus.ASSIGNED,
      ]);
      const isNotStarted = notStartedStatuses.has(order.status);
      if (actor.role === UserRole.CUSTOMER && (!isNotStarted || order.customerId !== actor.id)) {
        throw new ForbiddenException("Customers can cancel only their own orders before work starts");
      }
      if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.CUSTOMER) {
        throw new ForbiddenException();
      }
      if (!isNotStarted && !reason?.trim()) {
        throw new BadRequestException("A cancellation reason is required after work has started");
      }

      const update = await tx.workOrder.updateMany({
        where: { id: orderId, status: order.status },
        data: {
          status: OrderStatus.CANCELLED,
          cancellationReason: reason?.trim() || null,
        },
      });
      if (update.count !== 1) throw new ConflictException("Order has already changed");

      if (order.executorId) {
        await tx.orderAssignment.updateMany({
          where: {
            orderId,
            executorId: order.executorId,
            outcome: AssignmentOutcome.ACTIVE,
          },
          data: { outcome: AssignmentOutcome.RELEASED, endedAt: new Date() },
        });
      }
      await tx.orderEstimate.updateMany({
        where: { orderId, status: EstimateStatus.PENDING },
        data: {
          status: EstimateStatus.WITHDRAWN,
          responseComment: "Withdrawn because the order was cancelled",
          respondedAt: new Date(),
        },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          changedById: actor.id,
          fromStatus: order.status,
          toStatus: OrderStatus.CANCELLED,
          note: reason?.trim() || null,
        },
      });

      return tx.workOrder.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    });
  }

  async requireAttachmentUploadAccess(orderId: string, actor: Actor) {
    const order = await this.prisma.workOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException("Order not found");
    if (actor.role === UserRole.ADMIN) return order;
    if (actor.role === UserRole.CUSTOMER && order.customerId === actor.id && order.status === OrderStatus.NEW) {
      return order;
    }
    if (actor.role === UserRole.EXECUTOR && order.executorId === actor.id) return order;
    throw new ForbiddenException("You cannot upload files to this order");
  }

  async requireAttachmentReadAccess(orderId: string, actor: Actor) {
    return this.get(orderId, actor);
  }

  private async lockActiveExecutor(tx: Prisma.TransactionClient, id: string) {
    const executor = await tx.user.updateMany({
      where: { id, role: UserRole.EXECUTOR, isActive: true },
      data: { updatedAt: new Date() },
    });
    if (executor.count !== 1) throw new BadRequestException("Active executor not found");
  }
}
