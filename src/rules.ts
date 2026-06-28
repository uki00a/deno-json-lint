import { parse as parseSemver } from "@std/semver/parse";
import { greaterOrEqual as semverGreaterOrEqual } from "@std/semver/greater-or-equal";
import { parseArgsStringToArgv } from "string-argv";
import type { EditResult, JSONPath, Node } from "jsonc-parser";
import { findNodeAtLocation, getNodePath, getNodeValue } from "jsonc-parser";
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

export interface LintContext<T = unknown> {
  report(data: LintReport): void;
  readonly options: T;
  readonly denoVersion: string;
}

export interface LintRule<T = unknown> {
  id: string;
  tags: Array<LintRuleTag>;
  lint(reporter: LintContext<T>, node: Node | undefined): void;
  paths(): Array<JSONPath>;
  defaultOptions?: T;
  fix?: (tree: Node) => EditResult;
}

export function getAllRules(): Array<LintRule> {
  return [
    banAllowAll,
    noRestrictedFields,
    requireAllowList,
    requireLockfile,
    requireMinimumDependencyAge,
    requireTestSanitizers,
  ];
}

export function supportsFix(rule: LintRule): boolean {
  return typeof rule.fix === "function";
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
const kLock = "lock" satisfies keyof DenoConfigurationFileSchema;
const kMinimumDependencyAge =
  "minimumDependencyAge" satisfies keyof DenoConfigurationFileSchema;

const kRequireLockfile = "require-lockfile";
const kRequireMinimumDependencyAge = "require-minimum-dependency-age";
const kRequireTestSanitizers = "require-test-sanitizers";
const kNoRestrictedFields = "no-restricted-fields";
/**
 * Rules that are only applicable to the `deno.json` in the workspace root.
 */
export const kRootOnlyRules = [
  kRequireLockfile,
  kRequireMinimumDependencyAge,
  kRequireTestSanitizers,
];

export const kRootPath: JSONPath = [];

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

interface RestrictedFields extends Record<string, string | RestrictedFields> {}

interface NoRestrictedFieldsOptions {
  /**
   * An object whose keys are fields not permitted for use in `deno.json`, and whose values are messages.
   */
  fields?: RestrictedFields;
}

/**
 * Disallows certain fields in `deno.json`.
 */
export const noRestrictedFields: LintRule<NoRestrictedFieldsOptions> = {
  id: kNoRestrictedFields,
  tags: [],
  paths: () => [kRootPath],
  defaultOptions: {},
  lint(reporter, node) {
    if (node == null) return;
    const fields = reporter.options.fields ?? {};
    const lintFields = (
      fields: RestrictedFields,
      seenFields: Array<string> = [],
    ): void => {
      for (const [field, fieldsOrMessage] of Object.entries(fields)) {
        if (typeof fieldsOrMessage === "string") {
          const message = fieldsOrMessage;
          const found = findNodeAtLocation(node, [...seenFields, field]);
          if (found == null) continue;
          reporter.report({
            message,
            node: found.parent,
          });
        } else {
          lintFields(fieldsOrMessage, [...seenFields, field]);
        }
      }
    };
    lintFields(fields);
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
  id: kRequireLockfile,
  tags: ["recommended", "security", "dependencies"],
  paths: () => [
    [kLock],
    [kTasks],
  ],
  lint(reporter, node) {
    const path = node ? getNodePath(node) : [];
    if (node && path[0] === kTasks) {
      if (node.type !== "object") return;
      walkTaskValueNodes(node, (taskValueNode) => {
        const command = getCommandFromTaskValueNode(taskValueNode);
        if (command == null) return;
        const args = parseArgsStringToArgv(command);
        const kNoLockFlag = "--no-lock";
        if (args.includes(kNoLockFlag)) {
          reporter.report({
            node: taskValueNode,
            message: `${kNoLockFlag} should not be used`,
          });
        }
      });
    } else if (node != null && getNodeValue(node) === false) {
      reporter.report({
        message: "A lockfile should be enabled",
        node,
      });
    }
  },
  fix(tree) {
    const node = findNodeAtLocation(tree, [kLock]);
    if (
      node?.parent != null
    ) {
      return [
        {
          offset: node.parent.offset,
          length: node.parent.length,
          content: "",
        },
      ];
    }
    return [];
  },
};

function isMinimumDependencyAgeEnabledByDefault(
  denoVersion: string,
): boolean {
  return semverGreaterOrEqual(
    parseSemver(denoVersion),
    parseSemver("2.9.0"),
  );
}

/**
 * Enforces that `minimumDependencyAge` to be configured.
 */
export const requireMinimumDependencyAge: LintRule = {
  id: kRequireMinimumDependencyAge,
  tags: ["recommended", "security", "dependencies"],
  paths: () => [
    [kMinimumDependencyAge],
  ],
  lint(reporter, node) {
    const isEnabledByDefault = isMinimumDependencyAgeEnabledByDefault(
      reporter.denoVersion,
    );
    if (node == null) {
      if (isEnabledByDefault) return;
      reporter.report({
        message: `\`${kMinimumDependencyAge}\` should be configured`,
      });
    } else if (isEnabledByDefault) {
      const minimumDependencyAge = getNodeValue(node);
      const isDisabled = minimumDependencyAge === 0;
      if (isDisabled) {
        reporter.report({
          message: `\`${kMinimumDependencyAge}\` should be enabled`,
        });
      }
    }
  },
  fix(tree) {
    const maybeMinimumDependencyAgeNode = findNodeAtLocation(tree, [
      kMinimumDependencyAge,
    ]);
    /**
     * This is the default value for `minimumReleaseAge` in pnpm.
     */
    const defaultMinimumDependencyAge = 1440;
    const content =
      `"${kMinimumDependencyAge}": ${defaultMinimumDependencyAge}`;
    if (maybeMinimumDependencyAgeNode == null) {
      return [
        {
          offset: tree.length - 1,
          length: 0,
          content,
        },
      ];
    }
    return [
      {
        offset: maybeMinimumDependencyAgeNode.offset,
        length: maybeMinimumDependencyAgeNode.length,
        content: `${defaultMinimumDependencyAge}`,
      },
    ];
  },
};

/**
 * Enforces that test sanitizers to be enabled.
 */
export const requireTestSanitizers: LintRule = {
  id: kRequireTestSanitizers,
  tags: ["recommended"],
  paths: () => [kRootPath],
  lint(reporter, node) {
    if (node == null) return;
    const maybeTestNode = findNodeAtLocation(node, [kTest]);
    const kSanitizeOps = "sanitizeOps" as const satisfies keyof NonNullable<
      DenoConfigurationFileSchema["test"]
    >;
    const kSanitizeResources =
      "sanitizeResources" as const satisfies keyof NonNullable<
        DenoConfigurationFileSchema["test"]
      >;
    const kSanitizerOptions = [kSanitizeOps, kSanitizeResources];
    const illegalNodeBySanitizer = new Map<
      typeof kSanitizerOptions[number],
      Node
    >();
    function foundIllegalNode(
      node: Node,
      prop: typeof kSanitizeOps | typeof kSanitizeResources,
    ): void {
      if (illegalNodeBySanitizer.has(prop)) return;
      illegalNodeBySanitizer.set(prop, node);
    }

    if (maybeTestNode == null) {
      foundIllegalNode(node, kSanitizeOps);
      foundIllegalNode(node, kSanitizeResources);
    } else {
      const maybeSanitzeOpsNode = findNodeAtLocation(maybeTestNode, [
        kSanitizeOps,
      ]);
      const maybeSanitizeResourcesNode = findNodeAtLocation(maybeTestNode, [
        kSanitizeResources,
      ]);
      if (maybeSanitzeOpsNode == null && maybeSanitizeResourcesNode == null) {
        foundIllegalNode(maybeTestNode, kSanitizeOps);
        foundIllegalNode(maybeTestNode, kSanitizeResources);
      } else if (maybeSanitzeOpsNode == null) {
        foundIllegalNode(maybeTestNode, kSanitizeOps);
      } else if (maybeSanitizeResourcesNode == null) {
        foundIllegalNode(maybeTestNode, kSanitizeResources);
      }

      if (maybeSanitzeOpsNode != null) {
        const value = getNodeValue(maybeSanitzeOpsNode);
        if (value !== true) {
          foundIllegalNode(maybeSanitzeOpsNode, kSanitizeOps);
        }
      }

      if (maybeSanitizeResourcesNode != null) {
        const value = getNodeValue(maybeSanitizeResourcesNode);
        if (value !== true) {
          foundIllegalNode(maybeSanitizeResourcesNode, kSanitizeResources);
        }
      }
    }

    const areAllSanitizersEnabled = illegalNodeBySanitizer.size === 0;
    if (areAllSanitizersEnabled) {
      return;
    }

    for (const [sanitizer, node] of illegalNodeBySanitizer) {
      reporter.report({
        node,
        message: `\`test.${sanitizer}\` should be enabled`,
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
