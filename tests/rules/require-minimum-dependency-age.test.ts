import assert from "node:assert/strict";
import { applyFixes, lintAndFixText } from "../../src/lint.ts";

Deno.test({
  name: "require-minimum-dependency-age",
  permissions: "none",
  fn: async (t) => {
    await t.step("supports `--fix`", () => {
      const given = `{}`;
      const { fixes, unfixableDiagnostics } = lintAndFixText(given, {
        include: ["require-minimum-dependency-age"],
      });
      const actual = applyFixes(given, fixes);
      const expected = `{
  "minimumDependencyAge": 1440
}`;
      assert.strictEqual(actual, expected);
      assert.deepEqual(
        unfixableDiagnostics,
        [],
        "All diagnostics should be fixed",
      );
    });
  },
});
