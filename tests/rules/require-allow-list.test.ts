import assert from "node:assert/strict";
import { lintText } from "../../src/lint.ts";

Deno.test({
  name: "require-allow-list",
  permissions: "none",
  fn: async (t) => {
    await t.step(
      "reports the use of `--allow-*` without an allow list in tasks",
      async (t) => {
        for (
          const [kind, allowlist] of [
            ["read", "testdata"],
            ["net", "localhost"],
            ["run", "deno"],
          ]
        ) {
          await t.step(`--allow-${kind}`, () => {
            const given = `{
    "tasks": {
      "simple:ok": "deno run --allow-${kind}=${allowlist} --quiet src/cli.ts",
      "simple:ng": "deno run --allow-${kind} src/cli.ts",
      "complex:ok": {
        "command": "deno run --allow-${kind}=${allowlist} --reload src/cli.ts"
      },
      "complex:ng": {
        "description": "This is invalid",
        "command": "deno run --allow-${kind} src/cli.ts"
      }
    }
  }`;
            const actual = lintText(
              given,
              { include: ["require-allow-list"] },
            );
            const expected = [
              {
                id: "require-allow-list",
                message:
                  `An allow list should be specified for --allow-${kind}`,
                line: 4,
                column: 20,
              },
              {
                id: "require-allow-list",
                message:
                  `An allow list should be specified for --allow-${kind}`,
                line: 8,
                column: 21,
              },
            ];
            assert.deepEqual(actual, expected);
          });
        }
      },
    );

    await t.step(
      "supports short forms of permission flags",
      () => {
        const given = `{
  "tasks": {
    "ok": "deno run -R=testdata --quiet src/cli.ts",
    "ng": "deno run -N --quiet src/cli.ts"
  }
}`;
        const actual = lintText(
          given,
          { include: ["require-allow-list"] },
        );
        const expected = [
          {
            id: "require-allow-list",
            message: "An allow list should be specified for --allow-net",
            line: 4,
            column: 11,
          },
        ];
        assert.deepEqual(actual, expected);
      },
    );

    await t.step(
      "supports multiple combinations of permission flags",
      () => {
        const given = `{
  "tasks": {
    "ng": "deno run --allow-read -N --allow-run=deno --quiet src/cli.ts"
  }
}`;
        const actual = lintText(
          given,
          { include: ["require-allow-list"] },
        );
        const expected = [
          {
            id: "require-allow-list",
            message:
              "An allow list should be specified for --allow-read, --allow-net",
            line: 3,
            column: 11,
          },
        ];
        assert.deepEqual(actual, expected);
      },
    );
  },
});
