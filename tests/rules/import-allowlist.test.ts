import assert from "node:assert/strict";
import { lintText } from "../../src/lint.ts";

Deno.test({
  name: "import-allowlist",
  permissions: "none",
  fn: async (t) => {
    await t.step("reports disallowed imports", () => {
      const actual = lintText(
        `{
  "imports": {
    "@std/collections": "jsr:@std/collections@^1.1.3",
    "@std/fmt": "jsr:@std/fmt@^1.0.8",
    "jsonc-parser": "npm:jsonc-parser@^3.3.1"
  }
}`,
        {
          include: ["import-allowlist"],
          config: {
            rules: {
              "import-allowlist": ["error", {
                allowlist: ["@std/fmt", "jsonc-parser"],
              }],
            },
          },
        },
      );
      const expected = [
        {
          id: "import-allowlist",
          message: "`@std/collections` is not allowed",
          line: 3,
          column: 5,
        },
      ];
      assert.deepEqual(actual, expected);
    });
  },
});
