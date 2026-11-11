/**
 * In-memory stand-in for the Prisma client, limited to the operations the order,
 * invoice and account flows use.
 *
 * The suites assert what a call left in the database - the returned order, the
 * recorded status history, the rows that survived a refused transition - instead
 * of the arguments handed to Prisma, because those arguments describe the query
 * rather than the behaviour a user sees. The fake therefore applies the same
 * `where` filters, treats `undefined` in `data` as "leave unchanged" the way
 * Prisma does, and rolls back when a `$transaction` callback throws, so a refused
 * transition really leaves the previous state behind.
 *
 * Only the relations a case asserts are materialised under `include`; every other
 * included relation stays absent, so a case seeds just the tables it looks at.
 */

import { Prisma } from "../generated/prisma/client.js";
import { PaymentReportStatus } from "../generated/prisma/enums.js";

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

export type TableName =
  | "workOrder"
  | "orderStatusHistory"
  | "orderAssignment"
  | "orderEstimate"
  | "orderComment"
  | "orderAttachment"
  | "invoice"
  | "invoicePaymentReport"
  | "user"
  | "account"
  | "session";

export type FakeDatabaseOperation =
  | "findMany"
  | "updateMany"
  | "create"
  | "update"
  | "delete"
  | "count"
  | "deleteMany";

export type FakeDatabaseOptions = {
  /** Makes one operation throw, for the paths that must contain a database failure. */
  failOn?: { table: TableName; operation: FakeDatabaseOperation };
};

export type FakeDatabase = {
  /** The value to pass where the service expects a Prisma client. */
  readonly prisma: Record<string, unknown>;
  /** Current rows of a table, in insertion order, after a successful commit. */
  rows(table: TableName): readonly Row[];
};

const tableNames: readonly TableName[] = [
  "workOrder",
  "orderStatusHistory",
  "orderAssignment",
  "orderEstimate",
  "orderComment",
  "orderAttachment",
  "invoice",
  "invoicePaymentReport",
  "user",
  "account",
  "session",
];

/**
 * Column defaults the services rely on instead of sending them in `create`.
 * Only tables whose defaults a case observes are listed; anything else a case
 * needs must be seeded explicitly.
 */
const defaults: Partial<Record<TableName, () => Row>> = {
  invoicePaymentReport: () => ({ status: PaymentReportStatus.PENDING, submittedAt: new Date() }),
  user: () => ({ emailVerified: false, isActive: true }),
};

export function createFakeDatabase(
  seed: Partial<Record<TableName, Row[]>> = {},
  options: FakeDatabaseOptions = {},
): FakeDatabase {
  let tables = emptyTables();
  for (const name of tableNames) tables[name] = (seed[name] ?? []).map((row) => ({ ...row }));

  return {
    prisma: {
      ...tableAccessors(() => tables, options),
      $transaction: async (run: unknown) => {
        if (Array.isArray(run)) return Promise.all(run);

        const snapshot = cloneTables(tables);
        try {
          return await (run as (client: unknown) => Promise<unknown>)(
            tableAccessors(() => tables, options),
          );
        } catch (error) {
          tables = snapshot;
          throw error;
        }
      },
    },
    rows: (table) => tables[table],
  };
}

function emptyTables(): Record<TableName, Row[]> {
  return Object.fromEntries(tableNames.map((name) => [name, [] as Row[]])) as Record<
    TableName,
    Row[]
  >;
}

function cloneTables(tables: Record<TableName, Row[]>): Record<TableName, Row[]> {
  const copy = emptyTables();
  for (const name of tableNames) {
    copy[name] = tables[name].map((row) => ({ ...row }));
  }
  return copy;
}

function tableAccessors(
  tables: () => Record<TableName, Row[]>,
  options: FakeDatabaseOptions,
): Record<string, unknown> {
  const accessors: Record<string, unknown> = {};
  for (const name of tableNames) accessors[name] = tableApi(tables, name, options);
  return accessors;
}

type Query = {
  where?: Where;
  orderBy?: Where;
  select?: Record<string, boolean>;
  include?: Where;
  data?: Where;
};

function tableApi(
  tables: () => Record<TableName, Row[]>,
  name: TableName,
  options: FakeDatabaseOptions,
) {
  const read = (where?: Where): Row[] =>
    tables()[name].filter((row) => matches(name, row, where, tables()));
  const fail = (operation: FakeDatabaseOperation): void => {
    if (options.failOn?.table === name && options.failOn.operation === operation) {
      throw new Error(`The fake database rejected ${name}.${operation}`);
    }
  };

  return {
    findMany: async ({ where, orderBy, include, select }: Query = {}) => {
      fail("findMany");
      return read(where)
        .sort(comparator(orderBy))
        .map((row) => only(withRelations(name, row, include, tables()), select));
    },
    findFirst: async ({ where, include, select }: Query = {}) => {
      const row = read(where)[0];
      return row ? only(withRelations(name, row, include, tables()), select) : null;
    },
    findUnique: async ({ where, include, select }: Query = {}) => {
      const row = read(where)[0];
      return row ? only(withRelations(name, row, include, tables()), select) : null;
    },
    findUniqueOrThrow: async (query: Query = {}) => {
      const row = read(query.where)[0];
      if (!row) {
        throw new Error(`The fake database has no ${name} row for ${JSON.stringify(query)}`);
      }
      return only(withRelations(name, row, query.include, tables()), query.select);
    },
    updateMany: async ({ where, data = {} }: Query = {}) => {
      fail("updateMany");
      const rows = read(where);
      for (const row of rows) {
        for (const [field, value] of Object.entries(data)) {
          if (value !== undefined) row[field] = value;
        }
      }
      return { count: rows.length };
    },
    update: async ({ where, data = {}, select }: Query = {}) => {
      fail("update");
      const row = read(where)[0];
      if (!row) throw missingRecord(name, "update", where);
      for (const [field, value] of Object.entries(data)) {
        if (value !== undefined) row[field] = value;
      }
      return only({ ...row }, select);
    },
    delete: async ({ where, select }: Query = {}) => {
      fail("delete");
      const row = read(where)[0];
      if (!row) throw missingRecord(name, "delete", where);
      tables()[name] = tables()[name].filter((candidate) => candidate !== row);
      return only({ ...row }, select);
    },
    count: async ({ where }: Query = {}) => {
      fail("count");
      return read(where).length;
    },
    create: async ({ data = {}, select }: Query = {}) => {
      fail("create");
      const row: Row = { id: `${name}-${tables()[name].length + 1}`, ...defaults[name]?.(), ...data };
      tables()[name].push(row);
      return only(row, select);
    },
    deleteMany: async ({ where }: Query = {}) => {
      fail("deleteMany");
      const rows = read(where);
      const removed = new Set(rows);
      tables()[name] = tables()[name].filter((row) => !removed.has(row));
      return { count: rows.length };
    },
  };
}

/**
 * The error Prisma raises when a row-level write matches nothing, kept as the
 * real class so a service that maps `P2025` can be tested for that mapping.
 */
function missingRecord(table: TableName, operation: string, where: Where | undefined) {
  return new Prisma.PrismaClientKnownRequestError(
    `${table}.${operation} found no row for ${JSON.stringify(where)}`,
    { code: "P2025", clientVersion: "fake" },
  );
}

/** Prisma `where` semantics for the operators and relation filters the services use. */
function matches(name: TableName, row: Row, where: Where | undefined, tables: Record<TableName, Row[]>): boolean {
  if (!where) return true;

  return Object.entries(where).every(([field, condition]) => {
    if (field === "OR") {
      return (condition as Where[]).some((clause) => matches(name, row, clause, tables));
    }
    if (field === "AND") {
      return (condition as Where[]).every((clause) => matches(name, row, clause, tables));
    }
    if (field === "NOT") {
      return !matches(name, row, condition as Where, tables);
    }
    if (condition !== null && typeof condition === "object") {
      const relation = relations[name]?.[field];
      if (relation) {
        const clause = condition as Where;
        return tables[relation.table]
          .filter((candidate) => candidate[relation.targetField] === row[relation.localField])
          .some((candidate) => matches(relation.table, candidate, clause, tables));
      }

      const operator = condition as { in?: unknown[]; notIn?: unknown[]; not?: unknown };
      if (operator.in) return operator.in.includes(row[field]);
      if (operator.notIn) return !operator.notIn.includes(row[field]);
      if ("not" in operator) return row[field] !== operator.not;
      throw new Error(
        `The fake database does not support the filter ${field}: ${JSON.stringify(condition)}. ` +
          "Extend matches() instead of weakening the assertion.",
      );
    }
    return row[field] === condition;
  });
}

function comparator(orderBy?: Where): (left: Row, right: Row) => number {
  const entry = Object.entries(orderBy ?? {})[0];
  if (!entry) return () => 0;

  const [field, direction] = entry;
  const sign = direction === "desc" ? -1 : 1;

  return (left, right) => sign * compareValues(left[field], right[field]);
}

function compareValues(left: unknown, right: unknown): number {
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

/**
 * Materialises the relations a case asserts. Only relations listed here are
 * attached, so a case seeds just the tables it looks at and a missing entry means
 * the payload has no such key - which is how a case proves that, for example, an
 * executor never receives payment reports.
 */
type Relation = { table: TableName; localField: string; targetField: string; many: boolean };

const relations: Partial<Record<TableName, Record<string, Relation>>> = {
  workOrder: {
    invoices: { table: "invoice", localField: "id", targetField: "orderId", many: true },
  },
  invoice: {
    order: { table: "workOrder", localField: "orderId", targetField: "id", many: false },
    paymentReports: {
      table: "invoicePaymentReport",
      localField: "id",
      targetField: "invoiceId",
      many: true,
    },
  },
  invoicePaymentReport: {
    invoice: { table: "invoice", localField: "invoiceId", targetField: "id", many: false },
  },
};

function withRelations(
  name: TableName,
  row: Row,
  include: Where | undefined,
  tables: Record<TableName, Row[]>,
): Row {
  const result: Row = { ...row };

  for (const [relation, value] of Object.entries(include ?? {})) {
    const spec = relations[name]?.[relation];
    if (!spec) continue;

    const child = value as { include?: Where; select?: Record<string, boolean> };
    const related = tables[spec.table].filter(
      (candidate) => candidate[spec.targetField] === row[spec.localField],
    );
    const attach = (candidate: Row): Row =>
      only(withRelations(spec.table, candidate, child.include, tables), child.select);

    result[relation] = spec.many ? related.map(attach) : related[0] === undefined ? null : attach(related[0]);
  }

  return result;
}

function only(row: Row, select: Record<string, boolean> | undefined): Row {
  if (!select) return row;

  return Object.fromEntries(
    Object.entries(select)
      .filter(([, included]) => included)
      .map(([field]) => [field, row[field]]),
  );
}
