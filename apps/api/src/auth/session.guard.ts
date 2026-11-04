import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { fromNodeHeaders } from "better-auth/node";
import type { Request } from "express";
import { auth, type AuthSession } from "./auth.js";
import { ROLES_METADATA_KEY } from "./roles.decorator.js";

type AuthenticatedRequest = Request & { authSession?: AuthSession };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!session) {
      throw new UnauthorizedException();
    }

    if (!session.user.isActive) {
      throw new UnauthorizedException("This account is deactivated");
    }

    request.authSession = session;
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const userRole = session.user.role;
    if (requiredRoles?.length && (!userRole || !requiredRoles.includes(userRole))) {
      throw new ForbiddenException("This role cannot access the requested resource");
    }

    return true;
  }
}
