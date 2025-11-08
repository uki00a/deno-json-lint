import type { PermissionSet } from "../generated/config-file.v1.ts";

function keys<T extends Record<string, unknown>>(object: T): Array<keyof T> {
  return Object.keys(object) as Array<keyof T>;
}

type PermissionKind = (keyof PermissionSet) | "scripts";

const longNameByShortName = {
  "read": "R",
  "write": "W",
  "import": "I",
  "env": "E",
  "net": "N",
  "run": undefined,
  "ffi": undefined,
  "sys": "S",
  "scripts": undefined,
} satisfies {
  [Kind in Exclude<PermissionKind, "all">]: string | undefined;
};
const permissionKinds = keys(longNameByShortName);
const shortNames = Object.values(longNameByShortName);

export function isAllowAllFlag(arg: string): boolean {
  if (!arg.startsWith("-")) return false;

  const longFlag = "--allow-all";
  if (arg === longFlag) return true;

  const shortFlagName = "A";
  const shortFlag = `-${shortFlagName}`;
  if (arg === shortFlag) return true;

  for (
    let i = 1, char = arg[i];
    i < arg.length && char !== "=";
    i++, char = arg[i]
  ) {
    if (char === shortFlagName) return true;
  }
  return false;
}

export function findLaxPermissionFlags(
  args: Array<string>,
): Set<Exclude<PermissionKind, "all">> {
  const found = new Set<Exclude<PermissionKind, "all">>();
  for (const arg of args) {
    if (!arg.startsWith("-")) continue;
    if (arg.startsWith("--")) {
      const kAllowFlagPrefix = "--allow-";
      if (!arg.startsWith(kAllowFlagPrefix)) continue;
      const [flag, maybeAllowList] = arg.split("=");
      if (maybeAllowList) continue;
      for (const kind of permissionKinds) {
        if (flag === `${kAllowFlagPrefix}${kind}`) {
          found.add(kind);
          break;
        }
      }
    } else if (arg.startsWith("-")) {
      const [flag, maybeAllowList] = arg.split("=");
      if (maybeAllowList) continue;
      for (
        let i = 1;
        i < flag.length;
        i++
      ) {
        const char = flag[i];
        const j = shortNames.indexOf(char);
        if (j === -1) continue;
        const kind = permissionKinds[j];
        if (kind) found.add(kind);
      }
    }
  }
  return found;
}
