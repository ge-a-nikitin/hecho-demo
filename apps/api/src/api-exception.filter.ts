import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Prisma } from "./generated/prisma/client.js";
import type { Request, Response } from "express";

type ApiErrorResponse = {
  statusCode: number;
  code: string;
  message: string | string[];
  error: string;
};

const httpErrorNames: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: "Bad Request",
  [HttpStatus.UNAUTHORIZED]: "Unauthorized",
  [HttpStatus.FORBIDDEN]: "Forbidden",
  [HttpStatus.NOT_FOUND]: "Not Found",
  [HttpStatus.METHOD_NOT_ALLOWED]: "Method Not Allowed",
  [HttpStatus.CONFLICT]: "Conflict",
  [HttpStatus.PAYLOAD_TOO_LARGE]: "Payload Too Large",
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: "Unsupported Media Type",
  [HttpStatus.UNPROCESSABLE_ENTITY]: "Unprocessable Entity",
  [HttpStatus.TOO_MANY_REQUESTS]: "Too Many Requests",
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const errorResponse = createApiErrorResponse(exception);

    if (errorResponse.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(errorResponse.statusCode).json(errorResponse);
  }
}

export function createApiErrorResponse(exception: unknown): ApiErrorResponse {
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const body = exception.getResponse();
    const customCode = getHttpExceptionCode(body);
    const message = getHttpExceptionMessage(body) ?? exception.message;
    return {
      statusCode,
      code: customCode ?? codeForStatus(statusCode),
      message: statusCode >= HttpStatus.INTERNAL_SERVER_ERROR
        ? "An unexpected error occurred."
        : message,
      error: statusCode >= HttpStatus.INTERNAL_SERVER_ERROR
        ? "Internal Server Error"
        : getHttpErrorName(body, statusCode),
    };
  }

  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = prismaErrorResponse(exception.code);
    if (mapped) return mapped;
  }

  if (isMulterError(exception)) {
    if (exception.code === "LIMIT_FILE_SIZE") {
      return {
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        code: "PAYLOAD_TOO_LARGE",
        message: "Files may not exceed 1 MB.",
        error: httpErrorNames[HttpStatus.PAYLOAD_TOO_LARGE],
      };
    }
    return {
      statusCode: HttpStatus.BAD_REQUEST,
      code: "BAD_REQUEST",
      message: "The uploaded file or multipart form is invalid.",
      error: httpErrorNames[HttpStatus.BAD_REQUEST],
    };
  }

  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred.",
    error: "Internal Server Error",
  };
}

function getHttpExceptionCode(body: string | object): string | undefined {
  if (typeof body !== "object" || !("code" in body) || typeof body.code !== "string") {
    return undefined;
  }
  return /^[A-Z][A-Z0-9_]*$/u.test(body.code) ? body.code : undefined;
}

function getHttpExceptionMessage(body: string | object): string | string[] | undefined {
  if (typeof body === "string") return body;
  if (!("message" in body)) return undefined;
  const message = body.message;
  if (typeof message === "string") return message;
  if (Array.isArray(message) && message.every((item) => typeof item === "string")) {
    return message;
  }
  return undefined;
}

function getHttpErrorName(body: string | object, statusCode: number): string {
  if (typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return httpErrorNames[statusCode] ?? "Request Error";
}

function codeForStatus(statusCode: number): string {
  switch (statusCode) {
    case HttpStatus.BAD_REQUEST:
      return "BAD_REQUEST";
    case HttpStatus.UNAUTHORIZED:
      return "UNAUTHENTICATED";
    case HttpStatus.FORBIDDEN:
      return "FORBIDDEN";
    case HttpStatus.NOT_FOUND:
      return "NOT_FOUND";
    case HttpStatus.METHOD_NOT_ALLOWED:
      return "METHOD_NOT_ALLOWED";
    case HttpStatus.CONFLICT:
      return "CONFLICT";
    case HttpStatus.PAYLOAD_TOO_LARGE:
      return "PAYLOAD_TOO_LARGE";
    case HttpStatus.UNSUPPORTED_MEDIA_TYPE:
      return "UNSUPPORTED_MEDIA_TYPE";
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return "VALIDATION_FAILED";
    case HttpStatus.TOO_MANY_REQUESTS:
      return "TOO_MANY_REQUESTS";
    case HttpStatus.SERVICE_UNAVAILABLE:
      return "SERVICE_UNAVAILABLE";
    default:
      return statusCode >= HttpStatus.INTERNAL_SERVER_ERROR ? "INTERNAL_SERVER_ERROR" : "REQUEST_FAILED";
  }
}

function prismaErrorResponse(code: string): ApiErrorResponse | undefined {
  switch (code) {
    case "P2002":
      return {
        statusCode: HttpStatus.CONFLICT,
        code: "CONFLICT",
        message: "A record with the provided values already exists.",
        error: httpErrorNames[HttpStatus.CONFLICT],
      };
    case "P2003":
    case "P2014":
      return {
        statusCode: HttpStatus.CONFLICT,
        code: "CONFLICT",
        message: "This change conflicts with related records.",
        error: httpErrorNames[HttpStatus.CONFLICT],
      };
    case "P2025":
      return {
        statusCode: HttpStatus.NOT_FOUND,
        code: "NOT_FOUND",
        message: "The requested record was not found or has already changed.",
        error: httpErrorNames[HttpStatus.NOT_FOUND],
      };
    case "P2000":
    case "P2023":
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: "BAD_REQUEST",
        message: "The request contains an invalid value or identifier.",
        error: httpErrorNames[HttpStatus.BAD_REQUEST],
      };
    case "P2011":
    case "P2012":
    case "P2013":
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code: "BAD_REQUEST",
        message: "The request is missing required data.",
        error: httpErrorNames[HttpStatus.BAD_REQUEST],
      };
    default:
      return undefined;
  }
}

function isMulterError(
  exception: unknown,
): exception is Error & { code: string } {
  return exception instanceof Error &&
    exception.name === "MulterError" &&
    "code" in exception &&
    typeof exception.code === "string";
}
