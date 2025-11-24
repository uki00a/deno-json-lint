import { dirname, join, relative } from "node:path";
import { parseArgs } from "node:util";
import { bold, red, yellow } from "@std/fmt/colors";
import { lintText } from "./lint.ts";
import type { Config as DenoJsonLintConfig } from "./config.ts";
import { kConfigKey, mergeConfigs } from "./config.ts";
import { kRootOnlyRules } from "./rules.ts";
import type {
  DenoConfigurationFileSchema,
} from "../generated/config-file.v1.ts";

interface Logger {
  info(message: unknown): void;
  warn(message: unknown): void;
  error(message: unknown): void;
}

interface Options {
  cwd?: string;
  logger?: Logger;
  target?: string;
}

const kDenoJSON = "deno.json";
const kDenoJSONC = "deno.jsonc";

type WorkspaceConfig = Exclude<
  NonNullable<DenoConfigurationFileSchema["workspace"]>,
  string[]
>;
const kWorkspace = "workspace" satisfies keyof DenoConfigurationFileSchema;
const kMembers = "members" satisfies keyof WorkspaceConfig;

interface FoundDenoJSON {
  path: string;
  content: string;
  config?: DenoJsonLintConfig;
  parent?: FoundDenoJSON;
}

interface FoundWorkspace {
  parentDenoJSON: FoundDenoJSON;
  members: NonNullable<WorkspaceConfig["members"]>;
}

type ExitCode = 1 | 0;
async function main({
  cwd = Deno.cwd(),
  logger = console,
  target,
}: Options): Promise<ExitCode> {
  const allowedPaths: Array<string> = [];
  for (const configFilename of target ? [target] : [kDenoJSON, kDenoJSONC]) {
    const path = join(cwd, configFilename);
    const status = await Deno.permissions.query({
      name: "read",
      path,
    });
    if (status.state === "granted") {
      allowedPaths.push(path);
    }
  }

  if (allowedPaths.length === 0) {
    const path = target ? target : [kDenoJSON, kDenoJSONC].join(" or ");
    logger.error(
      bold(
        red(
          `Requires read access to ${path}, e.g. --allow-read=${
            target ? target : kDenoJSON
          }`,
        ),
      ),
    );
    return 1;
  }

  const denoJSONs: Array<FoundDenoJSON> = [];
  const workspaces: Array<FoundWorkspace> = [];
  for (const path of allowedPaths) {
    let configAsText: string | undefined = undefined;
    try {
      configAsText = await Deno.readTextFile(path);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        continue;
      }
      logger.error(error);
      return 1;
    }
    if (configAsText === undefined) continue;

    let parsed: ReturnType<typeof JSON.parse> | undefined = undefined;
    try {
      parsed = JSON.parse(configAsText);
    } catch (err) {
      if (!(err instanceof SyntaxError)) {
        logger.error(bold(red(`Detected an unexpected error: ${err}`)));
        return 1;
      }
      continue;
    }
    let config: DenoJsonLintConfig | undefined = undefined;
    if (parsed && parsed[kConfigKey]) {
      // TODO: Validate config
      config = parsed[kConfigKey];
    }
    const foundDenoJSON: FoundDenoJSON = {
      path,
      content: configAsText,
      config,
    };
    denoJSONs.push(foundDenoJSON);
    if (config == null) continue;
    if (parsed == null) continue;

    // Read workspace members
    const maybeWorkspace = parsed[kWorkspace];
    let members: NonNullable<WorkspaceConfig["members"]> | null = null;
    if (Array.isArray(maybeWorkspace)) {
      members = maybeWorkspace;
    } else if (maybeWorkspace && maybeWorkspace[kMembers]) {
      members = maybeWorkspace[kMembers];
    }

    if (members) {
      workspaces.push({
        parentDenoJSON: foundDenoJSON,
        members,
      });
    }
  }

  if (denoJSONs.length === 0) {
    logger.error(
      bold(red(
        `${target ? target : "deno.json(c)"} is not found`,
      )),
    );
    return 1;
  }

  for (let i = 0; i < workspaces.length; i++) {
    const workspace = workspaces[i];
    for (let j = 0; j < workspace.members.length; j++) {
      const path = join(
        dirname(workspace.parentDenoJSON.path),
        workspace.members[j],
      );
      const status = await Deno.permissions.query({
        name: "read",
        path,
      });
      if (status.state === "granted") {
        let configAsText: string | undefined = undefined;
        try {
          configAsText = await Deno.readTextFile(path);
        } catch (error) {
          if (error instanceof Deno.errors.NotFound) {
            continue;
          }
          logger.error(error);
          return 1;
        }
        if (configAsText === undefined) continue;
        let parsed: ReturnType<typeof JSON.parse> | undefined = undefined;
        try {
          parsed = JSON.parse(configAsText);
        } catch (err) {
          if (!(err instanceof SyntaxError)) {
            logger.error(bold(red(`Detected an unexpected error: ${err}`)));
            return 1;
          }
          continue;
        }
        let config: DenoJsonLintConfig | undefined = undefined;
        if (parsed && parsed[kConfigKey]) {
          // TODO: Validate config
          config = parsed[kConfigKey];
        }
        denoJSONs.push({
          path,
          content: configAsText,
          config,
          parent: workspace.parentDenoJSON,
        });
      } else {
        logger.error(
          bold(
            red(
              `Requires read access to ${path}`,
            ),
          ),
        );
        return 1;
      }
    }
  }

  let exitCode: ExitCode = 0;
  for (const { path, content, config, parent } of denoJSONs) {
    const isRoot = parent == null;
    const diagnostics = await lintText(
      content,
      {
        config: parent == null
          ? config
          : (parent.config && config
            ? mergeConfigs(parent.config, config)
            : config),
        exclude: isRoot ? undefined : kRootOnlyRules,
      },
    );
    if (diagnostics.length === 0) continue;

    const relativePath = relative(cwd, path);
    for (const diagnostic of diagnostics) {
      const line = diagnostic.line == null ? "" : `:${diagnostic.line}`;
      const column = diagnostic.column == null ? "" : `:${diagnostic.column}`;
      const severity = config?.rules?.[diagnostic.id] === "warn"
        ? "warn"
        : "error";
      const message =
        `${relativePath}${line}${column}: [${diagnostic.id}] ${diagnostic.message}`;
      if (severity === "error") {
        exitCode = 1;
        logger[severity](
          bold(
            red(
              message,
            ),
          ),
        );
      } else {
        logger[severity](
          yellow(message),
        );
      }
    }
  }
  return exitCode;
}

if (import.meta.main) {
  const logger = console;
  const { positionals } = parseArgs({
    args: Deno.args,
    allowPositionals: true,
  });
  main({
    logger,
    target: positionals[0],
  }).then((exitCode) => {
    Deno.exit(exitCode);
  });
}
