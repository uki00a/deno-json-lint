import { parseArgsStringToArgv } from "string-argv";
import type { JSONPath, Node } from "jsonc-parser";
import { getNodePath, getNodeValue } from "jsonc-parser";
import { findLaxPermissionFlags, isAllowAllFlag } from "./permissions.ts";
import type {
  AllowScriptsList,
  DenoConfigurationFileSchema,
  PermissionSet,
} from "../generated/config-file.v1.ts";

type LintRuleTag =
  | "dependencies"
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

const kPermissions = "permissions" satisfies keyof DenoConfigurationFileSchema;
const kCompile = "compile" satisfies keyof DenoConfigurationFileSchema;
const kTest = "test" satisfies keyof DenoConfigurationFileSchema;
const kBench = "bench" satisfies keyof DenoConfigurationFileSchema;
const kAllowScripts =
  "allowScripts" satisfies keyof DenoConfigurationFileSchema;
const kAllow = "allow" satisfies keyof Exclude<
  NonNullable<DenoConfigurationFileSchema["allowScripts"]>,
  boolean | AllowScriptsList
>;

/**
 * Disallows the use of `--allow-all`.
 */
export const banAllowAll: LintRule = {
  id: "ban-allow-all",
  tags: ["recommended", "security", "permissions"],
  paths: () => [
    [kTasks],
    [kPermissions],
    [kBench, kPermissions],
    [kCompile, kPermissions],
    [kTest, kPermissions],
  ],
  lint(reporter, node) {
    if (node == null) {
      return null;
    }
    const path = getNodePath(node);
    if (path[0] === kTasks && node.type === "object") {
      walkTaskValueNodes(node, (taskValueNode) => {
        const command = getCommandFromTaskValueNode(taskValueNode);
        if (command == null) return;
        const args = parseArgsStringToArgv(command);
        if (args.some(isAllowAllFlag)) {
          reporter.report({
            node: taskValueNode,
            message: "--allow-all/-A should not be used",
          });
        }
      });
    } else if (path[0] === kPermissions && node.type === "object") {
      walkPermissionSetNodes(node, (permissionSetNode) => {
        lintPermissionSet(permissionSetNode);
      });
    } else if (
      (path[0] === kBench || path[0] === kCompile || path[0] === kTest) &&
      path[1] === kPermissions &&
      node.type === "object"
    ) {
      lintPermissionSet(node);
    }
    return null;

    function lintPermissionSet(permissionSetNode: Node): void {
      if (permissionSetNode.type !== "object") return;
      for (
        let j = 0, length = permissionSetNode.children?.length ?? 0;
        j < length;
        j++
      ) {
        const propertyNode = permissionSetNode.children?.[j];
        if (propertyNode == null) continue;
        if (propertyNode.type !== "property") continue;
        const [permissionKindNode, permissionConfigNode] =
          propertyNode.children ?? [];
        if (permissionKindNode == null) continue;
        if (permissionConfigNode == null) continue;

        const permissionKind: keyof PermissionSet | null = getNodeValue(
          permissionKindNode,
        );
        if (permissionKind !== "all") continue;

        const permissionConfig = getNodeValue(permissionConfigNode);
        if (permissionConfig === true) {
          reporter.report({
            node: permissionConfigNode,
            message: `\`all: true\` should not be used`,
          });
        }
      }
    }
  },
};

/**
 * Enforces that `--allow-*` flag to have an allow list.
 */
export const requireAllowList: LintRule = {
  id: "require-allow-list",
  tags: ["recommended", "security", "permissions"],
  paths: () => [
    [kTasks],
    [kPermissions],
    [kBench, kPermissions],
    [kCompile, kPermissions],
    [kTest, kPermissions],
    [kAllowScripts],
    [kAllowScripts, kAllow],
  ],
  lint(reporter, node) {
    if (node == null) return;
    const path = getNodePath(node);
    if (path[0] === kTasks && node.type === "object") {
      walkTaskValueNodes(node, (taskValueNode) => {
        const command = getCommandFromTaskValueNode(taskValueNode);
        if (command == null) return;
        const args = parseArgsStringToArgv(command);
        const found = findLaxPermissionFlags(args);
        if (found.size > 0) {
          reporter.report({
            node: taskValueNode,
            message: `An allow list should be specified for ${
              Array.from(found).map((x) => `--allow-${x}`).join(", ")
            }`,
          });
        }
      });
    } else if (path[0] === kPermissions && node.type === "object") {
      walkPermissionSetNodes(node, (permissionSetNode) => {
        lintPermissionSet(permissionSetNode);
      });
    } else if (
      (path[0] === kBench || path[0] === kCompile || path[0] === kTest) &&
      path[1] === kPermissions &&
      node.type === "object"
    ) {
      lintPermissionSet(node);
    } else if (path[0] === kAllowScripts) {
      lintAllowScriptsConfig(node);
    }

    function lintPermissionSet(permissionSetNode: Node): void {
      if (permissionSetNode.type !== "object") return;
      for (
        let j = 0, length = permissionSetNode.children?.length ?? 0;
        j < length;
        j++
      ) {
        const propertyNode = permissionSetNode.children?.[j];
        if (propertyNode == null) continue;
        if (propertyNode.type !== "property") continue;
        const [permissionKindNode, permissionConfigNode] =
          propertyNode.children ?? [];
        if (permissionKindNode == null) continue;
        if (permissionConfigNode == null) continue;

        const permissionKind: keyof PermissionSet | null = getNodeValue(
          permissionKindNode,
        );
        if (permissionKind === "all") continue;

        const permissionConfig = getNodeValue(permissionConfigNode);
        if (permissionConfig === true) {
          reporter.report({
            node: permissionConfigNode,
            message: `An allow list should be specified`,
          });
        }
      }
    }

    function lintAllowScriptsConfig(node: Node): void {
      const message =
        "A list of npm packages allowed to run lifecycle scripts should be specified";
      const value = getNodeValue(node);
      if (value === true) {
        reporter.report({
          message,
          node,
        });
      } else if (Array.isArray(value) && value.length === 0) {
        reporter.report({
          message,
          node,
        });
      }
    }
  },
};

/**
 * Enforces that a lockfile to be enabled.
 */
export const requireLockfile: LintRule = {
  id: "require-lockfile",
  tags: ["recommended", "security", "dependencies"],
  paths: () => [
    ["lock" satisfies keyof DenoConfigurationFileSchema],
  ],
  lint(reporter, node) {
    if (node != null && getNodeValue(node) === false) {
      reporter.report({
        message: "A lockfile should be enabled",
        node,
      });
    }
  },
};

/**
 * Enforces that `minimumDependencyAge` to be configured.
 */
export const requireMinimumDependencyAge: LintRule = {
  id: "require-minimum-dependency-age",
  tags: ["recommended", "security", "dependencies"],
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

function walkPermissionSetNodes(
  permissionsNode: Node,
  visitor: (permissionSetNode: Node) => void,
): void {
  for (
    let i = 0, length = permissionsNode.children?.length ?? 0;
    i < length;
    i++
  ) {
    const propertyNode = permissionsNode.children?.[i];
    if (propertyNode == null) continue;
    if (propertyNode.type !== "property") continue;

    const [, permissionSetNode] = propertyNode.children ?? [];
    if (permissionSetNode == null) continue;
    visitor(permissionSetNode);
  }
}

function walkTaskValueNodes(
  tasksNode: Node,
  visitor: (taskValueNode: Node) => void,
): void {
  for (
    let i = 0, length = tasksNode.children?.length ?? 0;
    i < length;
    i++
  ) {
    const propertyNode = tasksNode.children?.[i];
    if (propertyNode == null) continue;
    if (propertyNode.type !== "property") continue;

    const [, taskValueNode] = propertyNode.children ?? [];
    if (taskValueNode == null) continue;
    if (taskValueNode.type !== "string" && taskValueNode.type !== "object") {
      continue;
    }
    visitor(taskValueNode);
  }
}

function getCommandFromTaskValueNode(taskValueNode: Node): string | undefined {
  const task = getNodeValue(taskValueNode);
  return typeof task === "object"
    ? (task as TaskDefinition).command
    : task as string;
}
