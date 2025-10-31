import type { JSONPath, Node } from "jsonc-parser";
import { getNodeValue } from "jsonc-parser";
import type { DenoConfigurationFileSchema } from "../generated/config-file.v1.ts";

type LintRuleTag = "recommended" | "security";

interface LintProblem {
  message: string;
}

export interface LintRule {
  id: string;
  tags: Array<LintRuleTag>;
  lint(node: Node | undefined): LintProblem | null;
  paths(): Array<JSONPath>;
}

export const requireLockfile: LintRule = {
  id: "require-lockfile",
  tags: ["recommended", "security"],
  paths: () => [
    ["lock" satisfies keyof DenoConfigurationFileSchema],
  ],
  lint(node) {
    if (node != null && getNodeValue(node) === false) {
      return { message: "A lockfile should be enabled" };
    }
    return null;
  },
};
export const requireMinimumDependencyAge: LintRule = {
  id: "require-minimum-dependency-age",
  tags: ["recommended", "security"],
  paths: () => [
    ["minimumDependencyAge" satisfies keyof DenoConfigurationFileSchema],
  ],
  lint(node) {
    return node == null
      ? { message: "`minimumDependencyAge` should be configured" }
      : null;
  },
};
