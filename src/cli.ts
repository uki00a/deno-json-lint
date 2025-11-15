import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { bold, red, yellow } from "@std/fmt/colors";
import { lintText } from "./lint.ts";
import type { Config as DenoJsonLintConfig } from "./config.ts";
import { kConfigKey } from "./config.ts";

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

  const configs: Array<{ path: string; content: string }> = [];
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
    configs.push({ path, content: configAsText });
  }

  if (configs.length === 0) {
    logger.error(
      bold(red(
        `${target ? target : "deno.json(c)"} is not found`,
      )),
    );
    return 1;
  }

  let config: DenoJsonLintConfig = { rules: {} };
  let foundConfigAt: string | null = null;
  for (const { content, path } of configs) {
    try {
      const parsed = JSON.parse(content);
      if (parsed == null) continue;
      if (parsed[kConfigKey] == null) continue;
      if (foundConfigAt) {
        logger.warn(
          yellow(
            `Ignored \"${kConfigKey}\" key in '${path}' since \"${kConfigKey}"\ was also found in '${foundConfigAt}'`,
          ),
        );
        continue;
      }
      foundConfigAt = path;
      // TODO: Validate `config`
      config = parsed[kConfigKey];
    } catch (err) {
      if (!(err instanceof SyntaxError)) {
        logger.error(bold(red(`Detected an unexpected error: ${err}`)));
        return 1;
      }
      continue;
    }
  }

  let exitCode: ExitCode = 0;
  for (const { path, content } of configs) {
    const diagnostics = await lintText(content, { config });
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
