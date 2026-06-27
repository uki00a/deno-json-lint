import assert from "node:assert/strict";
import { applyFixes, lintAndFixText, lintText } from "../../src/lint.ts";
import type { Diagnostic } from "../../src/lint.ts";

Deno.test({
  name: "require-minimum-dependency-age",
  permissions: "none",
  fn: async (t) => {
    await t.step(
      "allows `minimumDependencyAge` to be omitted if the Deno version is greater than or equal to 2.9.0",
      () => {
        const given = "{}";
        const actual = lintText(given, {
          include: ["require-minimum-dependency-age"],
          denoVersion: "2.9.0",
        });
        const expected: Array<Diagnostic> = [];
        assert.deepEqual(actual, expected);
      },
    );

    await t.step("encourages defining `minimumDependencyAge`", () => {
      const given = "{}";
      const actual = lintText(given, {
        include: ["require-minimum-dependency-age"],
        denoVersion: "2.8.3",
      });
      const expected: Array<Diagnostic> = [
        {
          id: "require-minimum-dependency-age",
          message: "`minimumDependencyAge` should be configured",
          line: undefined,
          column: undefined,
        },
      ];
      assert.deepEqual(actual, expected);
    });

    await t.step("supports `--fix`", () => {
      const given = `{}`;
      const { fixes, unfixableDiagnostics } = lintAndFixText(given, {
        include: ["require-minimum-dependency-age"],
        denoVersion: "2.8.3",
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
