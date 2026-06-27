import assert from "node:assert/strict";
import { findLaxPermissionFlags, isAllowAllFlag } from "../src/permissions.ts";

Deno.test({
  name: "findLaxPermissionFlags",
  permissions: "none",
  fn: () => {
    {
      const actual = findLaxPermissionFlags([
        "deno",
        "run",
        "--allow-net",
        "-RESq",
        "foo.ts",
      ]);
      const expected = ["net", "read", "env", "sys"];
      assert.deepEqual([...actual], expected);
    }

    {
      const actual = findLaxPermissionFlags([
        "deno",
        "run",
        "--allow-net=localhost",
        "-RE=foo",
        "-r",
        "foo.ts",
      ]);
      assert.deepEqual([...actual], []);
    }
  },
});

Deno.test.each(
  [
    ["--allow-all", true],
    ["-A", true],
    ["-rAq", true],
    ["--allow-allx", false],
    ["--allow-read", false],
  ],
)('isAllowAllFlag("%s")', {
  permissions: "none",
}, (given, expected) => {
  const actual = isAllowAllFlag(given);
  assert.equal(actual, expected);
});
