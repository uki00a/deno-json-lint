import { parseArgsStringToArgv } from "string-argv";
import type { JSONPath, Node } from "jsonc-parser";
import { getNodePath, getNodeValue } from "jsonc-parser";
import type { DenoConfigurationFileSchema } from "../generated/config-file.v1.ts";

type LintRuleTag =
  | "recommended"
  | "security"
  | "permissions";

interface LintReport {
  message: string;
  node?: Node;
}

export interface LintReporter {
  report(data: LintReport): void;
}

export interface LintRule {
  id: string;
  tags: Array<LintRuleTag>;
  lint(reporter: LintReporter, node: Node | undefined): void;
  paths(): Array<JSONPath>;
}

const kTasks = "tasks" satisfies keyof DenoConfigurationFileSchema;
type TaskDefinition = Exclude<
  NonNullable<DenoConfigurationFileSchema["tasks"]>[string],
  string
>;

export const banAllowAll: LintRule = {
  id: "ban-allow-all",
  tags: ["recommended", "security", "permissions"],
  paths: () => [
    // TODO: Support `permissions`
    [kTasks],
  ],
  lint(reporter, node) {
    if (node == null) {
      return null;
    }
    const flagsToBan = ["--allow-all", "-A"];
    const path = getNodePath(node);
    if (path[0] === kTasks && node.type === "object") {
      for (
        let i = 0, length = node.children?.length ?? 0;
        i < length;
        i++
      ) {
        const propertyNode = node.children?.[i];
        if (propertyNode == null) continue;
        if (propertyNode.type !== "property") continue;

        const [, taskNode] = propertyNode.children ?? [];
        if (taskNode == null) continue;
        if (taskNode.type !== "string" && taskNode.type !== "object") continue;
        const taskNodeValue = getNodeValue(taskNode);
        const task = typeof taskNodeValue === "object"
          ? (taskNodeValue as TaskDefinition).command
          : taskNodeValue as string;
        if (task == null) continue;
        const args = parseArgsStringToArgv(task);
        if (args.some((x) => flagsToBan.includes(x))) {
          reporter.report({
            node: taskNode,
            message: `${flagsToBan.join("/")} should not be used`,
          });
        }
      }
    }
    return null;
  },
};
export const requireLockfile: LintRule = {
  id: "require-lockfile",
  tags: ["recommended", "security"],
  paths: () => [
    ["lock" satisfies keyof DenoConfigurationFileSchema],
  ],
  lint(reporter, node) {
    if (node != null && getNodeValue(node) === false) {
      reporter.report({
        message: "A lockfile should be enabled",
      });
    }
  },
};
export const requireMinimumDependencyAge: LintRule = {
  id: "require-minimum-dependency-age",
  tags: ["recommended", "security"],
  paths: () => [
    ["minimumDependencyAge" satisfies keyof DenoConfigurationFileSchema],
  ],
  lint(reporter, node) {
    if (node == null) {
      reporter.report({
        message: "`minimumDependencyAge` should be configured",
      });
    }
  },
};
