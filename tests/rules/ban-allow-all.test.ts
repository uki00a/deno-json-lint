import assert from "node:assert/strict";
import { lintText } from "../../src/lint.ts";

Deno.test({
  name: "ban-allow-all",
  permissions: "none",
  fn: async (t) => {
    await t.step("reports the use of --allow-all in tasks", () => {
      const actual = lintText(
        `{
  "tasks": {
    "simple:ok": "deno run --allow-read=testdata src/cli.ts",
    "simple:ng": "deno run --allow-all src/cli.ts",
    "complex:ok": {
      "command": "deno run --allow-net=localhost src/cli.ts"
    },
    "complex:ng": {
      "description": "This includes -A",
      "command": "deno-run -A src/cli.ts"
    }
  }
}`,
        { include: ["ban-allow-all"] },
      );
      const expected = [
        {
          id: "ban-allow-all",
          message: "--allow-all/-A should not be used",
          line: 4,
          column: 18,
        },
        {
          id: "ban-allow-all",
          message: "--allow-all/-A should not be used",
          line: 8,
          column: 19,
        },
      ];
      assert.deepEqual(actual, expected);
    });

    await t.step("reports the use of `all: true` in permissions", () => {
      const actual = lintText(
        `{
  "permissions": {
    "ok": { "read": true, "all": false },
    "ng": { "all": true }
  }
}`,
        { include: ["ban-allow-all"] },
      );
      const expected = [
        {
          id: "ban-allow-all",
          message: "`all: true` should not be used",
          line: 4,
          column: 20,
        },
      ];
      assert.deepEqual(actual, expected);
    });

    await t.step(
      "reports the use of `all: true` in {bench,compile,test}.permissions",
      () => {
        const actual = lintText(
          `{
  "bench": {
    "permissions": { "all": true }
  },
  "compile": {
    "permissions": { "all": true }
  },
  "test": {
    "permissions": { "all": true }
  }
}`,
          { include: ["ban-allow-all"] },
        );
        const expected = [
          {
            id: "ban-allow-all",
            message: "`all: true` should not be used",
            line: 3,
            column: 29,
          },
          {
            id: "ban-allow-all",
            message: "`all: true` should not be used",
            line: 6,
            column: 29,
          },
          {
            id: "ban-allow-all",
            message: "`all: true` should not be used",
            line: 9,
            column: 29,
          },
        ];
        assert.deepEqual(actual, expected);
      },
    );
  },
});
