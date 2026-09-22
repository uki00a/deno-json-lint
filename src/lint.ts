import type { EditResult, JSONPath, Node } from "jsonc-parser";
import {
  applyEdits,
  findNodeAtLocation,
  format,
  parseTree,
} from "jsonc-parser";
import { LinesAndColumns } from "lines-and-columns";
import type { Config as DenoJsonLintConfig } from "./config.ts";
import type { LintContext, LintRule } from "./rules.ts";
import { getAllRules, kRootPath, supportsFix } from "./rules.ts";

function assert(x: unknown): asserts x {
  if (!x) {
    throw new Error("[Bug] An assertion failed");
  }
}

export interface Diagnostic {
  id: string;
  message: string;
  line?: number;
  column?: number;
}

export interface LintOptions {
  include?: Array<string>;
  exclude?: Array<string>;
  config?: DenoJsonLintConfig;
  denoVersion?: string;
}

interface LintAndFixResult {
  unfixableDiagnostics: Array<Diagnostic>;
  fixes: Array<Fix>;
}

export function lintAndFixText(
  configAsText: string,
  options?: LintOptions,
): LintAndFixResult {
  const tree = parseTree(configAsText);
  if (tree == null) return { fixes: [], unfixableDiagnostics: [] };
  const lines = new LinesAndColumns(configAsText);
  const diagnostics = lintTree(tree, lines, options);
  return computeFixes(diagnostics);
}

export function lintText(
  configAsText: string,
  options?: LintOptions,
): Array<Diagnostic> {
  const tree = parseTree(configAsText);
  if (tree == null) return [];
  const lines = new LinesAndColumns(configAsText);
  return lintTree(tree, lines, options);
}

function lintTree(
  tree: Node,
  lines: LinesAndColumns,
  options?: LintOptions,
): Array<Diagnostic> {
  const rules = determineRules(getAllRules(), options);
  const rulesGroupedByPath: Record<string, {
    rules: Array<LintRule>;
    path: JSONPath;
  }> = {};
  const rootKey = JSON.stringify(kRootPath);
  for (const rule of rules) {
    for (const path of rule.paths()) {
      const key = JSON.stringify(path);
      rulesGroupedByPath[key] ||= { rules: [], path };
      rulesGroupedByPath[key].rules.push(rule);
    }
  }
  const denoVersion = options?.denoVersion ?? Deno.version.deno;
  const diagnostics: Array<Diagnostic> = [];
  for (const [key, { rules, path }] of Object.entries(rulesGroupedByPath)) {
    const node = key === rootKey ? tree : findNodeAtLocation(tree, path);
    for (const rule of rules) {
      const maybeRuleConfig = options?.config?.rules?.[rule.id];
      const maybeRuleOptions = Array.isArray(maybeRuleConfig)
        ? maybeRuleConfig[1]
        : rule.defaultOptions;
      const context: LintContext = {
        options: maybeRuleOptions ?? rule.defaultOptions,
        denoVersion,
        report(data) {
          const { node, ...problem } = data;
          const maybeLocation = node && lines.locationForIndex(node.offset);
          const line = maybeLocation?.line ? maybeLocation.line + 1 : undefined;
          const column = maybeLocation?.column
            ? maybeLocation.column + 1
            : undefined;
          const diagnostic: Diagnostic = {
            ...problem,
            id: rule.id,
            line,
            column,
          };
          diagnostics.push(diagnostic);
        },
      };
      rule.lint(context, node);
    }
  }
  sortDiagnosticsInPlace(diagnostics);
  return diagnostics;
}

function sortDiagnosticsInPlace(diagnostics: Array<Diagnostic>): void {
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
}

interface Fix {
  id: string;
  applyTo(tree: Node, content: string): EditResult;
}
function computeFixes(
  diagnostics: Array<Diagnostic>,
): LintAndFixResult {
  if (diagnostics.length === 0) return { unfixableDiagnostics: [], fixes: [] };
  const ruleIds = diagnostics.reduce((ruleIds, x) => {
    ruleIds.add(x.id);
    return ruleIds;
  }, new Set<string>());
  const fixableRuleById = getAllRules().reduce((fixableRuleById, rule) => {
    if (ruleIds.has(rule.id) && supportsFix(rule)) {
      fixableRuleById.set(rule.id, rule);
    }
    return fixableRuleById;
  }, new Map<string, LintRule>());
  if (fixableRuleById.size === 0) {
    return { unfixableDiagnostics: diagnostics, fixes: [] };
  }

  const seenFixableRuleIds = new Set<string>();
  return diagnostics.reduce((result: LintAndFixResult, x) => {
    const maybeRule = fixableRuleById.get(x.id);
    if (maybeRule == null || maybeRule.fix == null) {
      result.unfixableDiagnostics.push(x);
      return result;
    }

    const fix = maybeRule.fix.bind(maybeRule);
    if (!seenFixableRuleIds.has(x.id)) {
      result.fixes.push({ id: x.id, applyTo: fix });
      seenFixableRuleIds.add(x.id);
    }
    return result;
  }, { fixes: [], unfixableDiagnostics: [] });
}

export function applyFixes(
  configAsText: string,
  fixes: Array<Fix>,
): string {
  if (fixes.length === 0) return configAsText;
  const fixed = fixes.reduce((text, fix) => {
    // TODO: parses the JSON every time the loop iterates, which is very inefficient.
    const tree = parseTree(text);
    assert(tree);
    const edits = fix.applyTo(tree, text);
    return applyEdits(text, edits);
  }, configAsText);
  const formatted = applyEdits(
    fixed,
    // TODO: Read `fmt` field in `deno.json` and adjust the options accordingly.
    format(fixed, {
      offset: 0,
      length: fixed.length,
    }, {
      tabSize: 2,
      insertSpaces: true,
    }),
  );
  return formatted;
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

  if (options.exclude != null && options.exclude.length > 0) {
    const { exclude: ruleIds } = options;
    predicates.push((x) => !ruleIds.includes(x.id));
  }

  if (options.config?.rules) {
    const disabledRules = Object.entries(options?.config?.rules)
      .filter(([, config]) => {
        const severity = Array.isArray(config) ? config[0] : config;
        return severity === "off";
      })
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
