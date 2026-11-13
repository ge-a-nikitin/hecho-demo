import type { QaseCase } from "../types.js";

const catalogueSuite = ["Categories", "Catalogue"] as const;
const validationSuite = ["Categories", "Request validation"] as const;

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
        action: "Seed one active `Plumbing` category and one retired one, then call `list(false)`.",
        expected: "Only the active category is returned.",
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
        action: "Seed `Zebra` as active and `Plumbing` as retired, then call `list(true)`.",
        expected: "Both are returned in name order - `Plumbing` first - with their active flags.",
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
        expected:
          "The returned and stored category is named `Repair`, records `createdById: \"user-1\"` and starts active.",
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
        expected: "The stored row `category-1` is named `Painting` and keeps its active flag.",
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
        expected:
          "After each call the stored row is inactive and then active again, and its name stays `Plumbing`.",
      },
    ],
  },
  {
    key: "categories.validation.create",
    suite: validationSuite,
    title: "rejects a category name that is blank or over the length limit",
    severity: "normal",
    priority: "high",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "A category name is the only label a customer sees in the order form, so a blank one produces an " +
      "unnamed option that cannot be picked deliberately. The 100-character limit keeps the dropdown row " +
      "readable, and `@Matches(/\\S/)` is what turns a whitespace-only name into a refused request instead " +
      "of a stored blank.",
    steps: [
      {
        action: "Validate names of 100 and 101 characters, then `\"   \"` and `\"\"`, against `CreateCategoryDto`.",
        expected:
          "Only the 100-character name is accepted; the longer, blank and empty names each report an error " +
          "for `name`.",
      },
    ],
  },
  {
    key: "categories.validation.rename",
    suite: validationSuite,
    title: "applies the same rules when a category is renamed",
    severity: "normal",
    priority: "medium",
    layer: "unit",
    type: "functional",
    behavior: "negative",
    description:
      "Rename talks to `UpdateCategoryDto`, a separate class from create, so the limits have to be " +
      "restated there. Without this case a rename could accept a 101-character name that creating the same " +
      "category refuses.",
    steps: [
      {
        action: "Validate a 101-character name against `UpdateCategoryDto`.",
        expected: "The result reports an error for `name`.",
      },
    ],
  },
] as const satisfies readonly QaseCase[];
