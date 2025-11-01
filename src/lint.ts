import type { JSONPath } from "jsonc-parser";
import { findNodeAtLocation, parseTree } from "jsonc-parser";
import { LinesAndColumns } from "lines-and-columns";
import type { LintReporter, LintRule } from "./rules.ts";
import {
  banAllowAll,
  requireAllowList,
  requireLockfile,
  requireMinimumDependencyAge,
} from "./rules.ts";

export interface Diagnostic {
  id: string;
  message: string;
  line?: number;
  column?: number;
}

export interface LintOptions {
  include?: Array<string>;
}

export function lintText(
  configAsText: string,
  options?: LintOptions,
): Array<Diagnostic> {
  const tree = parseTree(configAsText);
  if (tree == null) return [];
  const lines = new LinesAndColumns(configAsText);
  const rules = determineRules([
    banAllowAll,
    requireAllowList,
    requireLockfile,
    requireMinimumDependencyAge,
  ], options);
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
  const diagnostics: Array<Diagnostic> = [];
  for (const { rules, path } of Object.values(rulesGroupedByPath)) {
    const node = findNodeAtLocation(tree, path);
    for (const rule of rules) {
      const reporter: LintReporter = {
        report(data) {
          const { node, ...problem } = data;
          const maybeLocation = node && lines.locationForIndex(node.offset);
          const line = maybeLocation?.line ? maybeLocation.line + 1 : undefined;
          const column = maybeLocation?.column
            ? maybeLocation.column + 1
            : undefined;
          diagnostics.push({
            ...problem,
            id: rule.id,
            line,
            column,
          });
        },
      };
      rule.lint(reporter, node);
    }
  }
  return diagnostics;
}

function determineRules(
  rules: Array<LintRule>,
  options?: LintOptions,
): Array<LintRule> {
  if (options == null) {
    return rules;
  }
  if (options.include == null || options.include.length === 0) {
    return rules;
  }
  const { include: ruleIds } = options;
  return rules.filter((x) => ruleIds.includes(x.id));
}
