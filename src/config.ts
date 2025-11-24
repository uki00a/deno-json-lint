import { deepMerge } from "@std/collections/deep-merge";

export interface Config {
  rules?: Record<string, RuleConfig> | null;
}

export type Severity =
  | "off"
  | "warn"
  | "error";
type RuleConfig = Severity;

export const kConfigKey = "deno-json-lint";

export function mergeConfigs(a: Readonly<Config>, b: Readonly<Config>): Config {
  return deepMerge(a, b);
}
