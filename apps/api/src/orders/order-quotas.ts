import { positiveInteger } from "../common/settings.js";

/**
 * Limits that keep one account from filling the disk or the work queue.
 *
 * Registration is open to any visitor by design, and every attachment may be up
 * to 1 MB on the volume that shares the machine with the database, the API and
 * the tunnel. A per-file limit therefore protects nothing on its own: a fresh
 * account could post thousands of files, or thousands of orders, with no right
 * beyond registering. The quotas are counted on the trusted side before an
 * object reaches SeaweedFS, and each of them can be raised from the environment
 * without a rebuild.
 */

export interface OrderQuotas {
  /** Attachments one order may hold, whatever their size. */
  readonly attachmentsPerOrder: number;
  /** Attachments one account may upload in a rolling day. */
  readonly attachmentsPerDay: number;
  /** Orders one customer may keep open at the same time. */
  readonly openOrdersPerCustomer: number;
}

/** Documented defaults, mirrored in `.env.example` and the product documentation. */
export const ORDER_QUOTA_DEFAULTS = {
  attachmentsPerOrder: 20,
  attachmentsPerDay: 100,
  openOrdersPerCustomer: 20,
} as const;

export function orderQuotas(env: NodeJS.ProcessEnv = process.env): OrderQuotas {
  return {
    attachmentsPerOrder: positiveInteger(
      env,
      "ORDER_ATTACHMENT_LIMIT",
      ORDER_QUOTA_DEFAULTS.attachmentsPerOrder,
    ),
    attachmentsPerDay: positiveInteger(
      env,
      "ORDER_ATTACHMENT_DAILY_LIMIT",
      ORDER_QUOTA_DEFAULTS.attachmentsPerDay,
    ),
    openOrdersPerCustomer: positiveInteger(
      env,
      "ORDER_OPEN_LIMIT",
      ORDER_QUOTA_DEFAULTS.openOrdersPerCustomer,
    ),
  };
}
