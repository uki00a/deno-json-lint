import type { JSONPath } from "jsonc-parser";
import { findNodeAtLocation, parseTree } from "jsonc-parser";
import type { LintRule } from "./rules.ts";
import { requireLockfile, requireMinimumDependencyAge } from "./rules.ts";

interface Diagnostic {
  id: string;
  message: string;
}

export function lintText(
  configAsText: string,
): Array<Diagnostic> {
  const diagnostics: Array<Diagnostic> = [];
  const tree = parseTree(configAsText);
  if (tree == null) return [];
  const rules = [
    requireLockfile,
    requireMinimumDependencyAge,
  ];
  const rulesGroupedByPath: Record<string, {
    rules: Array<LintRule>;
    path: JSONPath;
  }> = {};
  for (const rule of rules) {
    for (const path of rule.paths()) {
      const key = JSON.stringify(path);
      rulesGroupedByPath[key] ||= { rules: [], path };
      rulesGroupedByPath[key].rules.push(rule);
    }
  }
  for (const { rules, path } of Object.values(rulesGroupedByPath)) {
    const node = findNodeAtLocation(tree, path);
    for (const rule of rules) {
      const maybeProblem = rule.lint(node);
      if (maybeProblem) {
        diagnostics.push({ ...maybeProblem, id: rule.id });
      }
    }
  }
  return diagnostics;
}
