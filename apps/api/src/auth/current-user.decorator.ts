import { createParamDecorator, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import type { AuthSession } from "./auth.js";

type AuthenticatedRequest = Request & { authSession?: AuthSession };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthSession["user"] => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.authSession) {
      throw new UnauthorizedException();
    }
    return request.authSession.user;
  },
);
