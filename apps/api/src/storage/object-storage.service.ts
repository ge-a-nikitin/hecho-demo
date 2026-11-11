import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { UploadedOrderFile } from "../orders/order-files.service.js";

@Injectable()
export class ObjectStorageService {
  private clientInstance?: S3Client;

  /**
   * Built on the first call rather than in the constructor, so importing or
   * instantiating the service needs no `S3_*` settings; a deployment that lacks
   * them still fails on the first request, where the misconfiguration shows up.
   */
  private get client(): S3Client {
    this.clientInstance ??= new S3Client({
      endpoint: requiredEnvironmentValue("S3_ENDPOINT"),
      region: process.env.S3_REGION ?? "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: requiredEnvironmentValue("S3_ACCESS_KEY"),
        secretAccessKey: requiredEnvironmentValue("S3_SECRET_KEY"),
      },
    });

    return this.clientInstance;
  }

  private get bucket(): string {
    return requiredEnvironmentValue("S3_BUCKET");
  }

  createObjectKey(orderId: string): string {
    return `orders/${orderId}/${randomUUID()}`;
  }

  async put(objectKey: string, file: UploadedOrderFile): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      Body: file.buffer,
      ContentLength: file.size,
      ContentType: file.mimetype || "application/octet-stream",
    }));
  }

  async get(objectKey: string): Promise<{ bytes: Buffer; contentType?: string }> {
    const result = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    }));
    if (!result.Body) throw new Error(`Object storage returned an empty body for ${objectKey}`);
    return {
      bytes: Buffer.from(await result.Body.transformToByteArray()),
      contentType: result.ContentType,
    };
  }

  async delete(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
    }));
  }

  /**
   * Removes every object in the bucket in batches of 1000, including files that
   * lost their database row earlier. Errors are counted instead of thrown so the
   * caller can report a partial purge after the database has already been reset.
   */
  async deleteAll(): Promise<{ deleted: number; failed: number }> {
    let deleted = 0;
    let failed = 0;
    let continuationToken: string | undefined;

    do {
      const page = await this.client.send(new ListObjectsV2Command({
        Bucket: this.bucket,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      }));
      const keys = (page.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : []));

      for (let index = 0; index < keys.length; index += 1000) {
        const batch = keys.slice(index, index + 1000);
        const result = await this.client.send(new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: batch.map((key) => ({ Key: key })), Quiet: false },
        }));
        deleted += result.Deleted?.length ?? 0;
        failed += result.Errors?.length ?? 0;
      }

      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);

    return { deleted, failed };
  }
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
