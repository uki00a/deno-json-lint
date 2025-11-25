import assert from "node:assert/strict";
import { lintText } from "../../src/lint.ts";

Deno.test({
  name: "require-lockfile",
  permissions: "none",
  fn: async (t) => {
    await t.step(
      "reports the use of `--no-lock`",
      () => {
        const given = `{
  "tasks": {
    "ok": "deno run main.js",
    "ng": "deno run --no-lock main.js"
  }
}`;
        const actual = lintText(
          given,
          { include: ["require-lockfile"] },
        );
        const expected = [
          {
            id: "require-lockfile",
            message: "--no-lock should not be used",
            line: 4,
            column: 11,
          },
        ];
        assert.deepEqual(actual, expected);
      },
    );

    await t.step(
      "reports the use of `lock: false`",
      () => {
        const given = `{
  "lock": false
}`;
        const actual = lintText(
          given,
          { include: ["require-lockfile"] },
        );
        const expected = [
          {
            id: "require-lockfile",
            message: "A lockfile should be enabled",
            line: 2,
            column: 11,
          },
        ];
        assert.deepEqual(actual, expected);
      },
    );
  },
});
