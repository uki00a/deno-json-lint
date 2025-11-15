export interface Config {
  rules?: Record<string, RuleConfig> | null;
}

export type Severity =
  | "off"
  | "warn"
  | "error";
type RuleConfig = Severity;

export const kConfigKey = "deno-json-lint";
