import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.service.js";
import type { UserRole } from "../generated/prisma/enums.js";
import { orderQuotas, type OrderQuotas } from "./order-quotas.js";
import { OrdersService } from "./orders.service.js";

type Actor = { id: string; role: UserRole };
export type UploadedOrderFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};
const MAX_FILE_SIZE_BYTES = 1_048_576;
const DAY_MS = 24 * 60 * 60 * 1_000;

@Injectable()
export class OrderFilesService {
  private readonly quotas: OrderQuotas = orderQuotas();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly orders: OrdersService,
  ) {}

  async upload(orderId: string, file: UploadedOrderFile | undefined, actor: Actor) {
    if (!file) throw new BadRequestException("A file is required");
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException("Files may not exceed 1 MB");
    }
    await this.orders.requireAttachmentUploadAccess(orderId, actor);
    await this.assertWithinQuota(orderId, actor);

    const objectKey = this.storage.createObjectKey(orderId);
    await this.storage.put(objectKey, file);
    try {
      const attachment = await this.prisma.orderAttachment.create({
        data: {
          orderId,
          uploadedById: actor.id,
          objectKey,
          filename: sanitizeFilename(file.originalname),
          contentType: file.mimetype || null,
          sizeBytes: file.size,
        },
      });
      return attachment;
    } catch (error) {
      await this.storage.delete(objectKey);
      throw error;
    }
  }

  /**
   * Counts what the account has already stored before the new object exists: a
   * refused upload must cost neither disk nor bandwidth, and the bucket shares
   * its volume with the database. The daily figure is a rolling day, so an
   * account cannot wait for midnight to send another batch.
   */
  private async assertWithinQuota(orderId: string, actor: Actor): Promise<void> {
    const { attachmentsPerOrder, attachmentsPerDay } = this.quotas;

    const inOrder = await this.prisma.orderAttachment.count({ where: { orderId } });
    if (inOrder >= attachmentsPerOrder) {
      throw new ConflictException(`An order may hold at most ${attachmentsPerOrder} attachments`);
    }

    const since = new Date(Date.now() - DAY_MS);
    const today = await this.prisma.orderAttachment.count({
      where: { uploadedById: actor.id, createdAt: { gte: since } },
    });
    if (today >= attachmentsPerDay) {
      throw new ConflictException(`An account may upload at most ${attachmentsPerDay} attachments a day`);
    }
  }

  async download(orderId: string, attachmentId: string, actor: Actor) {
    await this.orders.requireAttachmentReadAccess(orderId, actor);
    const attachment = await this.prisma.orderAttachment.findFirst({
      where: { id: attachmentId, orderId },
    });
    if (!attachment) throw new NotFoundException("Attachment not found");
    const object = await this.storage.get(attachment.objectKey);
    return {
      bytes: object.bytes,
      filename: attachment.filename,
      contentType: attachment.contentType ?? object.contentType ?? "application/octet-stream",
    };
  }
}

function sanitizeFilename(filename: string): string {
  const basename = filename.replaceAll("\\", "/").split("/").at(-1)?.trim();
  return basename?.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255) || "attachment";
}
