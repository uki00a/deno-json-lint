import type { JSONPath, Node } from "jsonc-parser";
import { findNodeAtLocation, getNodeValue, parseTree } from "jsonc-parser";
import type { DenoConfigurationFileSchema } from "../generated/config-file.v1.ts";

type LintRuleTag = "recommended" | "security";

interface LintRule {
  id: string;
  tags: Array<LintRuleTag>;
  lint(node: Node): Diagnostic | null;
  paths(): Array<JSONPath>;
}

interface Diagnostic {
  id: string;
  message: string;
}

interface LintProblem {
  message: string;
}

const requireLockfile: LintRule = {
  id: "require-lockfile",
  tags: ["recommended", "security"],
  paths: () => [
    ["lock" satisfies keyof DenoConfigurationFileSchema],
  ],
  lint(node) {
    if (getNodeValue(node) === false) {
      return { message: "A lockfile should be enabled" };
    }
    return null;
  },
};

export function lintText(
  configAsText: string,
): Array<Diagnostic> {
  const diagnostics: Array<Diagnostic> = [];
  const tree = parseTree(configAsText);
  if (tree == null) return [];
  const rulesGroupedByPath: Record<string, {
    rules: Array<LintRule>;
    path: JSONPath;
  }> = {};
  for (const rule of [requireLockfile]) {
    for (const path of rule.paths()) {
      const key = JSON.stringify(path);
      rulesGroupedByPath[key] ||= { rules: [], path };
      rulesGroupedByPath[key].rules.push(rule);
    }
  }
  for (const { rules, path } of Object.values(rulesGroupedByPath)) {
    const node = findNodeAtLocation(tree, path);
    if (node == null) continue;
    for (const rule of rules) {
      const maybeProblem = rule.lint(node);
      if (maybeProblem) {
        diagnostics.push({ ...maybeProblem, id: rule.id });
      }
    }
  }
  return diagnostics;
}
