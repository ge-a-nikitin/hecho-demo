import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

@Injectable()
export class DevToolsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.DEVTOOLS_ENABLED !== "true") {
      throw new NotFoundException();
    }

    const configuredKey = process.env.DEVTOOLS_API_KEY;
    if (!configuredKey) {
      throw new InternalServerErrorException("Dev tools are enabled but DEVTOOLS_API_KEY is not configured");
    }
    if (Buffer.byteLength(configuredKey) < 32) {
      throw new InternalServerErrorException("DEVTOOLS_API_KEY must contain at least 32 bytes");
    }

    const request = context.switchToHttp().getRequest<Request>();
    const suppliedKey = request.header("x-devtools-api-key");
    if (!suppliedKey || !keysMatch(configuredKey, suppliedKey)) {
      throw new UnauthorizedException("A valid dev tools API key is required");
    }
    return true;
  }
}

function keysMatch(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
