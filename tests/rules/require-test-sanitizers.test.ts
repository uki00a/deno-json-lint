import assert from "node:assert/strict";
import type { Diagnostic } from "../../src/lint.ts";
import { lintText } from "../../src/lint.ts";

Deno.test({
  name: "require-test-sanitizers",
  permissions: "none",
  fn: async (t) => {
    await t.step(
      "does not report an error if all sanitizers are enabled",
      () => {
        const given = `{
  "test"  : {
    "sanitizeOps": true,
    "sanitizeResources": true
  }
}`;
        const actual = lintText(
          given,
          { include: ["require-test-sanitizers"] },
        );
        const expected: typeof actual = [];
        assert.deepEqual(actual, expected);
      },
    );

    await t.step(
      "encourages enabling `test.sanitizeOps` and `test.sanitizeResources` if both are not defined",
      () => {
        const given = `{
  "test"  : {}
}`;
        const actual = lintText(
          given,
          { include: ["require-test-sanitizers"] },
        );
        const expected = [
          {
            id: "require-test-sanitizers",
            message: "`test.sanitizeOps` should be enabled",
            line: 2,
            column: 13,
          },
          {
            id: "require-test-sanitizers",
            message: "`test.sanitizeResources` should be enabled",
            line: 2,
            column: 13,
          },
        ];
        assert.deepEqual(actual, expected);
      },
    );

    await t.step(
      "encourages enabling `test.sanitizeOps` and `test.sanitizeResources` if both are disabled",
      () => {
        const given = `{
  "test"  : {
    "sanitizeResources": false,
    "sanitizeOps": false
  }
}`;
        const actual = lintText(
          given,
          { include: ["require-test-sanitizers"] },
        );
        const expected = [
          {
            id: "require-test-sanitizers",
            message: "`test.sanitizeResources` should be enabled",
            line: 3,
            column: 26,
          },
          {
            id: "require-test-sanitizers",
            message: "`test.sanitizeOps` should be enabled",
            line: 4,
            column: 20,
          },
        ];
        assert.deepEqual(actual, expected);
      },
    );

    await t.step(
      "encourages enabling only `test.sanitizeOps` if `test.sanitizeResources` is enabled",
      () => {
        const given = `{
  "test"  : {
    "sanitizeResources": true
  }
}`;
        const actual = lintText(
          given,
          { include: ["require-test-sanitizers"] },
        );
        const expected = [
          {
            id: "require-test-sanitizers",
            message: "`test.sanitizeOps` should be enabled",
            line: 2,
            column: 13,
          },
        ];
        assert.deepEqual(actual, expected);
      },
    );

    await t.step(
      "encourages enabling only `test.sanitizeResources` if `test.sanitizeOps` is enabled",
      () => {
        const given = `{
  "test"  : {
    "sanitizeOps": true
  }
}`;
        const actual = lintText(
          given,
          { include: ["require-test-sanitizers"] },
        );
        const expected = [
          {
            id: "require-test-sanitizers",
            message: "`test.sanitizeResources` should be enabled",
            line: 2,
            column: 13,
          },
        ];
        assert.deepEqual(actual, expected);
      },
    );

    await t.step(
      "allows `test.sanitizeOps` and `test.sanitizeResources` to be omitted if the Deno version is less than 2.8.0",
      () => {
        const given = "{}";
        const actual = lintText(given, {
          include: ["require-test-sanitizers"],
          denoVersion: "2.7.14",
        });
        const expected: Array<Diagnostic> = [];
        assert.deepEqual(actual, expected);
      },
    );
  },
});
