import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { UploadedOrderFile } from "../orders/order-files.service.js";

@Injectable()
export class ObjectStorageService {
  private readonly client = new S3Client({
    endpoint: requiredEnvironmentValue("S3_ENDPOINT"),
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: requiredEnvironmentValue("S3_ACCESS_KEY"),
      secretAccessKey: requiredEnvironmentValue("S3_SECRET_KEY"),
    },
  });
  private readonly bucket = requiredEnvironmentValue("S3_BUCKET");

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
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
