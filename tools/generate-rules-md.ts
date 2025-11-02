import type { LintRule } from "../src/rules.ts";
import * as rules from "../src/rules.ts";

async function main() {
  const decoder = new TextDecoder();
  const { code, stdout, stderr } = await new Deno.Command("deno", {
    args: [
      "doc",
      "--json",
      "src/rules.ts",
    ],
  }).output();
  if (code !== 0) {
    throw new Error(decoder.decode(stderr));
  }
  const { nodes } = JSON.parse(decoder.decode(stdout));
  const sections = [];
  for (const node of nodes) {
    if (node.declarationKind !== "export") continue;
    if (node.kind !== "variable") continue;
    if (node.variableDef.tsType.repr !== "LintRule") continue;
    // @ts-expect-error - TODO: type `nodes`
    const rule = rules[node.name] as LintRule;
    sections.push(`## \`${rule.id}\`

- **Description**: ${node.jsDoc?.doc ?? ""}
- **Tags**: ${rule.tags.join(", ")}`);
  }

  const content = `## Rules

<!-- This file was automatically generated -->

${sections.join("\n\n")}`;
  await Deno.writeTextFile("docs/rules.md", content);
}

if (import.meta.main) {
  main().catch((error) => {
    // deno-lint-ignore no-console -- This is a script file that is not provided to users.
    console.error(error);
    Deno.exit(1);
  });
}
