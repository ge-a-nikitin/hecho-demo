import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Flat config for the whole workspace. The repository had no linter, and the
 * suite audit kept finding the same two weak assertion patterns, so the config
 * stays close to the recommended TypeScript set and adds rules that encode the
 * findings where they can regress: the test files.
 */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "apps/api/src/generated/**",
      "apps/api/logs/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The TypeScript compiler already resolves identifiers and unused
      // declarations; disabling the base rules keeps one owner for each check.
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Rules for the suites. `toBeDefined` and the `in` operator were the two
    // recurring weak oracles in the audit: the first reports only that a value
    // exists, the second counts inherited members and fails with `false`
    // instead of naming the missing property.
    files: ["**/*.spec.ts", "apps/api/test/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='toBeDefined']",
          message:
            "Assert the value or the object itself: `toBeDefined()` prints only `undefined` and hides which field broke.",
        },
        {
          selector: "BinaryExpression[operator='in']",
          message:
            "Assert the property with `toHaveProperty` instead of the `in` operator: it also counts inherited members and reports `false` rather than the missing property.",
        },
        {
          selector: "CallExpression[callee.property.name='only']",
          message: "Remove `.only` before committing: it silently skips every other case.",
        },
      ],
    },
  },
);
