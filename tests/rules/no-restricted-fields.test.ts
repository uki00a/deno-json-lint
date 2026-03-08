import assert from "node:assert/strict";
import { lintText } from "../../src/lint.ts";

Deno.test({
  name: "no-restricted-fields",
  permissions: "none",
  fn: async (t) => {
    await t.step("reports the use of disallowed properties", () => {
      const actual = lintText(
        `{
  "imports": {
    "@std/fmt": "jsr:@std/fmt@^1.0.8"
  },
  "lock": true
}`,
        {
          include: ["no-restricted-fields"],
          config: {
            rules: {
              "no-restricted-fields": ["error", {
                fields: {
                  imports: "Don't use this property",
                },
              }],
            },
          },
        },
      );
      const expected = [
        {
          id: "no-restricted-fields",
          message: "Don't use this property",
          line: 2,
          column: 3,
        },
      ];
      assert.deepEqual(actual, expected);
    });

    await t.step("support nested properties", () => {
      const actual = lintText(
        `{
  "imports": {
    "@std/fmt": "jsr:@std/fmt@^1.0.8"
  },
  "lint": {
    "rules": {
      "exclude": ["./foo.js"]
    }
  }
}`,
        {
          include: ["no-restricted-fields"],
          config: {
            rules: {
              "no-restricted-fields": ["error", {
                fields: {
                  lint: {
                    rules: {
                      exclude: "Use of lint.rules.exclude is not allowed",
                    },
                  },
                },
              }],
            },
          },
        },
      );
      const expected = [
        {
          id: "no-restricted-fields",
          message: "Use of lint.rules.exclude is not allowed",
          line: 7,
          column: 7,
        },
      ];
      assert.deepEqual(actual, expected);
    });
  },
});
