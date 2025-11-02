import assert from "node:assert/strict";

Deno.test({
  name: "src/cli.ts",
  permissions: { read: false, run: ["deno"] },
  fn: async (t) => {
    const decoder = new TextDecoder();
    await t.step("reports diagnostics to stderr", async () => {
      const target = "testdata/deno.ng.json";
      const { code, stdout, stderr } = await new Deno.Command("deno", {
        args: [
          "run",
          `--allow-read=${target}`,
          "src/cli.ts",
          target,
        ],
        env: { NO_COLOR: "1" },
      }).output();
      assert.equal(code, 1);

      const actual = decoder.decode(stderr).trim();
      const expected = [
        `${target}:2:11: [require-lockfile] A lockfile should be enabled`,
        `${target}: [require-minimum-dependency-age] \`minimumDependencyAge\` should be configured`,
      ].join("\n");
      assert.equal(actual, expected);

      assert.equal(decoder.decode(stdout).trim(), "");
    });

    await t.step(
      "does not run lint if the target file is not permitted to be read",
      async (t) => {
        for (const file of ["testdata/deno.no-lock.json", "deno.json"]) {
          await t.step(file, async () => {
            const { code, stdout, stderr } = await new Deno.Command("deno", {
              args: [
                "run",
                "src/cli.ts",
                file,
              ],
              env: { NO_COLOR: "1" },
            }).output();
            assert.equal(code, 1);

            const actual = decoder.decode(stderr).trim();
            const expected =
              `Requires read access to ${file}, e.g. --allow-read=${file}`;
            assert.equal(actual, expected);

            assert.equal(decoder.decode(stdout).trim(), "");
          });
        }
      },
    );

    await t.step(
      "reports an error if a config file cannot be found",
      async () => {
        const target = "no-such-file.json";
        const { code, stdout, stderr } = await new Deno.Command("deno", {
          args: [
            "run",
            `--allow-read=${target}`,
            "src/cli.ts",
            target,
          ],
          env: { NO_COLOR: "1" },
        }).output();
        assert.equal(code, 1);
        assert.equal(decoder.decode(stdout).trim(), "");

        const actual = decoder.decode(stderr).trim();
        const expected = `${target} is not found`;
        assert.equal(actual, expected);
      },
    );
  },
});
