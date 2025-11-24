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
        `${target}: [require-minimum-dependency-age] \`minimumDependencyAge\` should be configured`,
        `${target}:2:11: [require-lockfile] A lockfile should be enabled`,
        `${target}:4:23: [ban-allow-all] --allow-all/-A should not be used`,
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

    await t.step(
      "supports customizing the behavior",
      async () => {
        const target = "testdata/deno.with-config.json";
        const { code, stdout, stderr } = await new Deno.Command("deno", {
          args: [
            "run",
            `--allow-read=${target}`,
            "src/cli.ts",
            target,
          ],
          env: { NO_COLOR: "1" },
        }).output();
        assert.equal(code, 0);
        assert.equal(decoder.decode(stdout).trim(), "");

        const actual = decoder.decode(stderr).trim();
        const expected =
          `${target}: [require-minimum-dependency-age] \`minimumDependencyAge\` should be configured`;
        assert.equal(actual, expected);
      },
    );

    await t.step(
      "supports workspaces",
      async () => {
        const target = "testdata/deno.ws-root.json";
        const child1 = "testdata/workspace/deno.1.json";
        const child2 = "testdata/workspace/deno.2.json";
        const { code, stdout, stderr } = await new Deno.Command("deno", {
          args: [
            "run",
            `--allow-read=${target},${child1},${child2}`,
            "src/cli.ts",
            target,
          ],
          env: { NO_COLOR: "1" },
        }).output();
        assert.equal(code, 1);
        assert.equal(decoder.decode(stdout).trim(), "");

        const actual = decoder.decode(stderr).trim();
        const expected = [
          `${target}:13:15: [require-allow-list] An allow list should be specified`,
          `${child1}:3:11: [ban-allow-all] --allow-all/-A should not be used`,
          `${child2}:3:21: [require-allow-list] An allow list should be specified`,
          `${child2}:4:20: [ban-allow-all] \`all: true\` should not be used`,
        ].join("\n");
        assert.equal(actual, expected);
      },
    );
  },
});
