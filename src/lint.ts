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

export interface Diagnostic {
  id: string;
  message: string;
  line?: number;
  column?: number;
}

/**
 * @private
 * @deprecated TODO: This was introduced to allow {@linkcode Node} to be returned when `--fix` is executed, but it is not ideal because it exposes implementation details.
 */
interface InternalDiagnostic extends Diagnostic {
  node?: Node;
}

/** @private */
export const kIncludeNode = Symbol("deno-json-lint.includeNode");
export interface LintOptions {
  include?: Array<string>;
  exclude?: Array<string>;
  config?: DenoJsonLintConfig;
}

/**
 * @private
 * @deprecated This was introduced to allow {@linkcode Node} to be returned when `--fix` is executed, but it is not ideal because it exposes implementation details.
 */
interface InternalLintOptions extends LintOptions {
  /** @private */
  [kIncludeNode]?: boolean;
}

export function lintText(
  configAsText: string,
  options?: LintOptions,
): Array<Diagnostic>;
export function lintText(
  configAsText: string,
  options: InternalLintOptions,
): Array<InternalDiagnostic>;
export function lintText(
  configAsText: string,
  options?: LintOptions | InternalLintOptions,
): Array<Diagnostic | InternalDiagnostic> {
  const tree = parseTree(configAsText);
  if (tree == null) return [];
  const lines = new LinesAndColumns(configAsText);
  const shouldIncludeNodes = options != null &&
    (options as InternalLintOptions)[kIncludeNode] === true;
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
        report(data) {
          const { node, ...problem } = data;
          const maybeLocation = node && lines.locationForIndex(node.offset);
          const line = maybeLocation?.line ? maybeLocation.line + 1 : undefined;
          const column = maybeLocation?.column
            ? maybeLocation.column + 1
            : undefined;
          const diagnostic: InternalDiagnostic = {
            ...problem,
            id: rule.id,
            line,
            column,
          };
          if (shouldIncludeNodes) {
            diagnostic.node = node;
          }
          diagnostics.push(diagnostic);
        },
      };
      rule.lint(context, node);
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

interface Fix {
  id: string;
  edits: EditResult;
}
interface ComputedFixes {
  unfixableDiagnostics: Array<Diagnostic>;
  fixes: Array<Fix>;
}
export function computeFixes(
  diagnostics: Array<InternalDiagnostic>,
): ComputedFixes {
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

  return diagnostics.reduce((result: ComputedFixes, x) => {
    const maybeRule = fixableRuleById.get(x.id);
    if (maybeRule == null || maybeRule.fix == null || x.node == null) {
      result.unfixableDiagnostics.push(x);
      return result;
    }

    const edits = maybeRule.fix(x.node);
    result.fixes.push({ id: x.id, edits });
    return result;
  }, { fixes: [], unfixableDiagnostics: [] });
}

export function applyFixes(
  configAsText: string,
  fixes: Array<Fix>,
): string {
  if (fixes.length === 0) return configAsText;
  const fixed = fixes.reduce((configAsText, fix) => {
    return applyEdits(configAsText, fix.edits);
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
