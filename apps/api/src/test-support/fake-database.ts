/**
 * In-memory stand-in for the Prisma client, limited to the operations the order
 * flows use.
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
  | "invoicePaymentReport";

export type FakeDatabaseOperation = "findMany" | "updateMany" | "create" | "deleteMany";

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
];

export function createFakeDatabase(
  seed: Partial<Record<TableName, Row[]>> = {},
  options: FakeDatabaseOptions = {},
): FakeDatabase {
  let tables = emptyTables();
  for (const name of tableNames) tables[name] = (seed[name] ?? []).map((row) => ({ ...row }));

  return {
    prisma: {
      ...tableAccessors(() => tables, options),
      $transaction: async (run: (client: unknown) => Promise<unknown>) => {
        const snapshot = cloneTables(tables);
        try {
          return await run(tableAccessors(() => tables, options));
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
  const read = (where?: Where): Row[] => tables()[name].filter((row) => matches(row, where));
  const fail = (operation: FakeDatabaseOperation): void => {
    if (options.failOn?.table === name && options.failOn.operation === operation) {
      throw new Error(`The fake database rejected ${name}.${operation}`);
    }
  };

  return {
    findMany: async ({ where, orderBy, include }: Query = {}) => {
      fail("findMany");
      return read(where)
        .sort(comparator(orderBy))
        .map((row) => withRelations(row, include, tables()));
    },
    findFirst: async ({ where, include }: Query = {}) => {
      const row = read(where)[0];
      return row ? withRelations(row, include, tables()) : null;
    },
    findUnique: async ({ where, include, select }: Query = {}) => {
      const row = read(where)[0];
      return row ? only(withRelations(row, include, tables()), select) : null;
    },
    findUniqueOrThrow: async (query: Query = {}) => {
      const row = read(query.where)[0];
      if (!row) {
        throw new Error(`The fake database has no ${name} row for ${JSON.stringify(query)}`);
      }
      return only(withRelations(row, query.include, tables()), query.select);
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
    create: async ({ data = {} }: Query = {}) => {
      fail("create");
      const row: Row = { id: `${name}-${tables()[name].length + 1}`, ...data };
      tables()[name].push(row);
      return row;
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

/** Prisma `where` semantics for the operators the services actually use. */
function matches(row: Row, where?: Where): boolean {
  if (!where) return true;

  return Object.entries(where).every(([field, condition]) => {
    if (field === "OR") {
      return (condition as Where[]).some((clause) => matches(row, clause));
    }
    if (field === "AND") {
      return (condition as Where[]).every((clause) => matches(row, clause));
    }
    if (field === "NOT") {
      return !matches(row, condition as Where);
    }
    if (condition !== null && typeof condition === "object") {
      const operator = condition as { in?: unknown[]; not?: unknown };
      if (operator.in) return operator.in.includes(row[field]);
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
 * Materialises the relations a case asserts. Nested invoices carry their payment
 * reports only when the caller included them, which is what lets a case prove
 * that an executor never receives receipt metadata.
 */
function withRelations(row: Row, include: Where | undefined, tables: Record<TableName, Row[]>): Row {
  const result: Row = { ...row };
  const invoices = include?.invoices as { include?: { paymentReports?: unknown } } | undefined;

  if (invoices) {
    result.invoices = tables.invoice
      .filter((invoice) => invoice.orderId === row.id)
      .map((invoice) =>
        invoices.include?.paymentReports
          ? {
              ...invoice,
              paymentReports: tables.invoicePaymentReport.filter(
                (report) => report.invoiceId === invoice.id,
              ),
            }
          : { ...invoice },
      );
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
