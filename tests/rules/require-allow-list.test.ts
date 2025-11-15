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
            ["scripts", "npm:duckdb"],
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
    "ng": "deno run --allow-read -NS -E=DENO_DIR --allow-run=deno --quiet src/cli.ts"
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
              "An allow list should be specified for --allow-read, --allow-net, --allow-sys",
            line: 3,
            column: 11,
          },
        ];
        assert.deepEqual(actual, expected);
      },
    );

    await t.step(
      "supports `permissions` field",
      () => {
        const actual = lintText(
          `{
  "permissions": {
    "ok": { "all": true, "read": ["testdata"] },
    "ng": { "read": true, "sys": true }
  }
}`,
          { include: ["require-allow-list"] },
        );
        const expected = [
          {
            id: "require-allow-list",
            message: "An allow list should be specified",
            line: 4,
            column: 21,
          },
          {
            id: "require-allow-list",
            message: "An allow list should be specified",
            line: 4,
            column: 34,
          },
        ];
        assert.deepEqual(actual, expected);
      },
    );

    await t.step(
      "supports `{bench,compile,test}.permissions` fields",
      () => {
        const actual = lintText(
          `{
  "bench": {
    "permissions": { "write": true }
  },
  "compile": {
    "permissions": { "ffi": true }
  },
  "test": {
    "permissions": { "net": true }
  }
}`,
          { include: ["require-allow-list"] },
        );
        const expected = [
          {
            id: "require-allow-list",
            message: "An allow list should be specified",
            line: 3,
            column: 31,
          },
          {
            id: "require-allow-list",
            message: "An allow list should be specified",
            line: 6,
            column: 29,
          },
          {
            id: "require-allow-list",
            message: "An allow list should be specified",
            line: 9,
            column: 29,
          },
        ];
        assert.deepEqual(actual, expected);
      },
    );

    await t.step(
      "reports the unsafe use of `allowScripts` field",
      async (t) => {
        for (const value of [true, []]) {
          const serialized = JSON.stringify(value);
          await t.step(`allowScripts: ${serialized}`, () => {
            const actual = lintText(
              `{
  "allowScripts": ${serialized}
}`,
              { include: ["require-allow-list"] },
            );
            const expected = [
              {
                id: "require-allow-list",
                message:
                  "A list of npm packages allowed to run lifecycle scripts should be specified",
                line: 2,
                column: 19,
              },
            ];
            assert.deepEqual(actual, expected);
          });
        }
      },
    );

    await t.step(
      "reports the unsafe use of `allowScripts.allow`",
      async (t) => {
        for (const value of [true, []]) {
          const serialized = JSON.stringify(value);
          await t.step(`allowScripts.allow: ${serialized}`, () => {
            const actual = lintText(
              `{
  "allowScripts": {
    "allow": ${serialized}
  }
}`,
              { include: ["require-allow-list"] },
            );
            const expected = [
              {
                id: "require-allow-list",
                message:
                  "A list of npm packages allowed to run lifecycle scripts should be specified",
                line: 3,
                column: 14,
              },
            ];
            assert.deepEqual(actual, expected);
          });
        }
      },
    );

    await t.step(
      "allows `allowScripts` with an allow list",
      () => {
        const actual = lintText(
          `{
  "allowScripts": ["npm:better-sqlite3"]
}`,
          { include: ["require-allow-list"] },
        );
        assert.deepEqual(actual, []);
      },
    );

    await t.step(
      "allows `allowScripts.allow` with an allow list",
      () => {
        const actual = lintText(
          `{
  "allowScripts": {
    "allow": ["npm:better-sqlite3"]
  }
}`,
          { include: ["require-allow-list"] },
        );
        assert.deepEqual(actual, []);
      },
    );
  },
});
