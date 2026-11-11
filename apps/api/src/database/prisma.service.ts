import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: requireDatabaseUrl() }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

function requireDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  return connectionString;
}

let client: PrismaService | undefined;

function clientInstance(): PrismaService {
  client ??= new PrismaService();
  return client;
}

/**
 * The shared client for the modules that cannot receive it through Nest - the
 * Better Auth adapter, for instance. It is built on first use, so importing the
 * module needs no `DATABASE_URL`, while a missing connection string still fails
 * at the first query instead of at import.
 */
export const prisma = new Proxy({} as PrismaService, {
  get: (_target, property) => {
    const instance = clientInstance();
    const value = Reflect.get(instance, property);

    return typeof value === "function" ? value.bind(instance) : value;
  },
});
