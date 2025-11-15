import type { JSONPath } from "jsonc-parser";
import { findNodeAtLocation, parseTree } from "jsonc-parser";
import { LinesAndColumns } from "lines-and-columns";
import type { Config as DenoJsonLintConfig } from "./config.ts";
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
  config?: DenoJsonLintConfig;
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
  diagnostics.sort((a, b) => {
    if (a.line == null) {
      if (b.line == null) return a.id < b.id ? -1 : 1;
      else return -1;
    } else if (b.line == null) {
      return 1;
    } else if (a.line === b.line) {
      if (a.column != null && b.column != null) {
        const cmp = a.column - b.column;
        if (cmp === 0) {
          return a.id < b.id ? -1 : 1;
        } else {
          return cmp;
        }
      } else {
        const cmp = (a.column ?? 0) - (b.column ?? 0);
        if (cmp === 0) return a.id < b.id ? -1 : 1;
        else return cmp;
      }
    } else {
      return a.line - b.line;
    }
  });
  return diagnostics;
}

function determineRules(
  rules: Array<LintRule>,
  options?: LintOptions,
): Array<LintRule> {
  if (options == null) {
    return rules;
  }
  const predicates: Array<(rule: LintRule) => boolean> = [];
  if (options.include != null && options.include.length > 0) {
    const { include: ruleIds } = options;
    predicates.push((x) => ruleIds.includes(x.id));
  }

  if (options.config?.rules) {
    const disabledRules = Object.entries(options?.config?.rules)
      .filter(([, severity]) => severity === "off")
      .map(([id]) => id);
    if (disabledRules.length > 0) {
      predicates.push((x) => !disabledRules.includes(x.id));
    }
  }

  if (predicates.length === 0) {
    return rules;
  }
  return rules.filter((x) => predicates.every((p) => p(x)));
}
