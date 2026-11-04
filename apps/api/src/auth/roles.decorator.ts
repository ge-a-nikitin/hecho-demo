import { SetMetadata } from "@nestjs/common";

export const ROLES_METADATA_KEY = "required-roles";

export function Roles(...roles: string[]) {
  return SetMetadata(ROLES_METADATA_KEY, roles);
}
