import type { QaseCase } from "../types.js";

const catalogueSuite = ["Categories", "Catalogue"] as const;

export const categoriesCases = [
  {
    key: "categories.list.hides-inactive",
    suite: catalogueSuite,
    title: "keeps retired categories out of the default list",
    severity: "major",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Retiring a category must stop it from being offered on a new order without deleting the orders " +
      "that already reference it, so the flag filters the picker instead of removing the row. The list is " +
      "ordered by name because the web form renders it as a plain dropdown.",
    steps: [
      {
        action: "Call `list(false)`.",
        expected: "The query filters on `isActive: true` and orders by name ascending.",
      },
    ],
  },
  {
    key: "categories.list.includes-inactive",
    suite: catalogueSuite,
    title: "shows retired categories when asked for the full catalogue",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "The administrator screen has to see and reactivate retired categories, which is the only reason " +
      "the service takes the flag at all. Asking for the full catalogue must drop the filter rather than " +
      "pass `isActive: false`, which would show only the retired ones.",
    steps: [
      {
        action: "Call `list(true)`.",
        expected: "The query runs without an `isActive` filter and keeps the name ordering.",
      },
    ],
  },
  {
    key: "categories.create.trims-name",
    suite: catalogueSuite,
    title: "stores a new category with its name trimmed",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Category names are typed by hand and pasted from spreadsheets, so stray leading and trailing " +
      "spaces are common. Trimming at the service keeps the unique name meaningful and stops \"Repair\" " +
      "and \"Repair \" from becoming two entries, and it records who created the row for the audit trail.",
    steps: [
      {
        action: "Call `create(\"  Repair \", \"user-1\")`.",
        expected: "The insert carries `name: \"Repair\"` and `createdById: \"user-1\"`.",
      },
    ],
  },
  {
    key: "categories.rename.trims-name",
    suite: catalogueSuite,
    title: "renames a category with its name trimmed",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "A rename goes through the same hand-typed input as a create, so it needs the same normalisation; " +
      "otherwise the whitespace comes back on the first edit after a clean insert.",
    steps: [
      {
        action: "Call `rename(\"category-1\", \" Painting \")`.",
        expected: "The update targets `category-1` with `name: \"Painting\"`.",
      },
    ],
  },
  {
    key: "categories.set-active.toggles-flag",
    suite: catalogueSuite,
    title: "retires and restores a category without touching its name",
    severity: "major",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "positive",
    description:
      "Retiring and restoring are the same write with a different value, and the update must not carry " +
      "the name: a stale copy from the admin screen would silently undo a rename made in another tab.",
    steps: [
      {
        action: "Call `setActive(\"category-1\", false)` and then `setActive(\"category-1\", true)`.",
        expected: "Each update writes only `isActive` for `category-1`.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
