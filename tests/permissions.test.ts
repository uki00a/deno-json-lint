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

Deno.test({
  name: "isAllowAllFlag",
  permissions: "none",
  fn: () => {
    assert(isAllowAllFlag("--allow-all"));
    assert(isAllowAllFlag("-A"));
    assert(isAllowAllFlag("-rAq"));
    assert(!isAllowAllFlag("--allow-allx"));
    assert(!isAllowAllFlag("--allow-read"));
  },
});
