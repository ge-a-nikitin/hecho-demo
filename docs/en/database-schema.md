# Database schema

[← Documentation](./README.md) · [Русская версия](../ru/database-schema.md)

This document describes the current Prisma model for PostgreSQL. The source of truth for types, relations, and fields is [`apps/api/prisma/schema.prisma`](../../apps/api/prisma/schema.prisma); when changing the model, update this diagram and the constraint descriptions.

## ER diagram

```mermaid
erDiagram
    User {
        String id PK
        String name
        String email UK
        Boolean emailVerified
        String image
        UserRole role
        Boolean isActive
        Decimal hourlyRate
        DateTime createdAt
        DateTime updatedAt
    }

    Session {
        String id PK
        DateTime expiresAt
        String token UK
        String userId FK
        String ipAddress
        String userAgent
        DateTime createdAt
        DateTime updatedAt
    }

    Account {
        String id PK
        String accountId
        String providerId
        String userId FK
        String accessToken
        String refreshToken
        String idToken
        DateTime accessTokenExpiresAt
        DateTime refreshTokenExpiresAt
        String scope
        String password
        DateTime createdAt
        DateTime updatedAt
    }

    Verification {
        String id PK
        String identifier
        String value
        DateTime expiresAt
        DateTime createdAt
        DateTime updatedAt
    }

    Category {
        String id PK
        String name UK
        Boolean isActive
        String createdById FK
        DateTime createdAt
        DateTime updatedAt
    }

    WorkOrder {
        String id PK
        String title
        String description
        OrderStatus status
        String customerId FK
        String executorId FK
        String categoryId FK
        DateTime dueAt
        String location
        Decimal approvedHours
        Decimal approvedHourlyRate
        Decimal approvedAmount
        String cancellationReason
        DateTime submittedAt
        DateTime acceptedAt
        DateTime completedAt
        DateTime createdAt
        DateTime updatedAt
    }

    OrderEstimate {
        String id PK
        String orderId FK
        String proposedById FK
        Decimal hours
        Decimal hourlyRate
        Decimal amount
        EstimateStatus status
        String responseComment
        DateTime proposedAt
        DateTime respondedAt
    }

    OrderAssignment {
        String id PK
        String orderId FK
        String executorId FK
        String assignedById FK
        AssignmentOutcome outcome
        DateTime assignedAt
        DateTime endedAt
    }

    WorkTimeEntry {
        String id PK
        String orderId FK
        Int minutes
        String timeNote
        DateTime updatedAt
    }

    OrderComment {
        String id PK
        String orderId FK
        String authorId FK
        String content
        DateTime createdAt
    }

    OrderAttachment {
        String id PK
        String orderId FK
        String uploadedById FK
        String objectKey UK
        String filename
        String contentType
        Int sizeBytes
        DateTime createdAt
    }

    OrderStatusHistory {
        String id PK
        String orderId FK
        String changedById FK
        OrderStatus fromStatus
        OrderStatus toStatus
        String note
        DateTime createdAt
    }

    Invoice {
        String id PK
        String orderId FK
        String issuedById FK
        String voidedById FK
        String number UK
        InvoiceStatus status
        String customerName
        String executorName
        String currency
        Decimal hours
        Decimal hourlyRate
        Decimal amount
        DateTime issuedAt
        DateTime paidAt
        DateTime voidedAt
        String voidReason
        DateTime createdAt
    }

    InvoicePaymentReport {
        String id PK
        String invoiceId FK
        String submittedById FK
        String reviewedById FK
        String objectKey UK
        String filename
        String contentType
        Int sizeBytes
        PaymentReportStatus status
        String reviewComment
        DateTime submittedAt
        DateTime reviewedAt
    }

    InvoiceSequence {
        Int year PK
        Int lastNumber
        DateTime updatedAt
    }

    User ||--o{ Session : has
    User ||--o{ Account : has
    User ||--o{ Category : creates
    User ||--o{ WorkOrder : customer
    User o|--o{ WorkOrder : executor
    Category ||--o{ WorkOrder : categorizes
    WorkOrder ||--o{ OrderEstimate : has
    User ||--o{ OrderEstimate : proposes
    WorkOrder ||--o{ OrderAssignment : records
    User ||--o{ OrderAssignment : assigned_executor
    User o|--o{ OrderAssignment : assigns
    WorkOrder ||--o| WorkTimeEntry : tracks
    WorkOrder ||--o{ OrderComment : has
    User ||--o{ OrderComment : writes
    WorkOrder ||--o{ OrderAttachment : has
    User ||--o{ OrderAttachment : uploads
    WorkOrder ||--o{ OrderStatusHistory : records
    User ||--o{ OrderStatusHistory : changes
    WorkOrder ||--o{ Invoice : billed_by
    User ||--o{ Invoice : issues
    User o|--o{ Invoice : voids
    Invoice ||--o{ InvoicePaymentReport : payment_reports
    User ||--o{ InvoicePaymentReport : submits
    User o|--o{ InvoicePaymentReport : reviews
```

`Verification` and `InvoiceSequence` have no foreign keys: Better Auth looks up verifications by `identifier`, and the yearly counter is used when issuing an invoice number.
For Mermaid compatibility, nullable fields are shown without a separate annotation; their optionality should be checked against the Prisma model. The `WorkTimeEntry.timeNote` attribute corresponds to the `WorkTimeEntry.comment` field in Prisma.

## Domain rules and constraints

- One user has one role. `isActive = false` means a deactivated account; historical records are not deleted. Before deactivating an executor, all their unfinished orders must be reassigned.
- An order has one current executor (`WorkOrder.executorId`); `OrderAssignment` preserves assignment history. The pool must be claimed atomically at the API level.
- An order can have multiple estimates over its approval history and at most one summary record of actual time spent.
- `WorkTimeEntry.orderId` is unique, so an order has at most one time entry.
- Only one estimate awaiting a decision is allowed per order. This constraint is enforced by the partial unique PostgreSQL index `OrderEstimate_one_pending_per_order_key`, created by a migration.
- A pending estimate becomes `WITHDRAWN` if the executor declines the assignment or the administrator reassigns the order before the customer responds.
- Customer acceptance is recorded by `WorkOrder.acceptedAt`; before an invoice is issued, the status remains `ON_REVIEW`, and acceptance is reflected in the status history as a separate event.
- `Invoice` stores snapshots of the customer name, executor name, hours, rate, and amount. Numbers are generated in the format `INV-YYYY-000001` through `InvoiceSequence` inside a transaction.
- The customer submits a receipt as a separate `InvoicePaymentReport` record; the document is available only to the customer and administrators, not to executors. Receipts and administrator decisions are preserved as history.
- At most one receipt awaiting review is allowed per invoice; the constraint is enforced by the partial unique index `InvoicePaymentReport_one_pending_per_invoice_key`.
- The payment report itself does not change the invoice or order status. Administrator confirmation moves the invoice to `PAID`, the order to `INVOICE_PAID`, and the receipt record to `CONFIRMED`. Completing the order is a separate administrator action that moves the order from `INVOICE_PAID` to `COMPLETED` and records `completedAt`; it requires a paid invoice. Rejection requires a reason, the record becomes `REJECTED`, and the customer can submit a new receipt.
- A voided invoice remains in the database, and its number is not reused. Only an unpaid invoice can be voided; after voiding, a new invoice may be issued.
- The partial unique PostgreSQL index `Invoice_one_current_per_order_key` guarantees at most one invoice per order with a status other than `VOID`. The `Invoice_status_consistency_check` constraint verifies that the `ISSUED`, `PAID`, and `VOID` statuses are consistent with the payment and voiding fields. These two constraints are defined in a SQL migration and cannot be expressed directly in Prisma Schema Language.
- File size and access checks are API rules; the `OrderAttachment` table stores metadata and the object key in S3-compatible storage.

## Enums

- `UserRole`: `CUSTOMER`, `EXECUTOR`, `ADMIN`
- `OrderStatus`: `NEW`, `WAITING_DISTRIBUTION`, `ASSIGNED`, `IN_PROGRESS`, `ON_REVIEW`, `NEEDS_REVISION`, `INVOICE_ISSUED`, `INVOICE_PAID`, `COMPLETED`, `CANCELLED`
- `EstimateStatus`: `PENDING`, `ACCEPTED`, `REJECTED`, `WITHDRAWN`
- `AssignmentOutcome`: `ACTIVE`, `DECLINED`, `REASSIGNED`, `RELEASED`
- `InvoiceStatus`: `ISSUED`, `PAID`, `VOID`
- `PaymentReportStatus`: `PENDING`, `REJECTED`, `CONFIRMED`
