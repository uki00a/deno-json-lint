import { join, relative } from "node:path";
import { parseArgs } from "node:util";
import { bold, red } from "@std/fmt/colors";
import { lintText } from "./lint.ts";

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

    const diagnostics = await lintText(configAsText);
    if (diagnostics.length === 0) return 0;

    const relativePath = relative(cwd, path);
    for (const diagnostic of diagnostics) {
      const line = diagnostic.line == null ? "" : `:${diagnostic.line}`;
      const column = diagnostic.column == null ? "" : `:${diagnostic.column}`;
      logger.error(
        bold(
          red(
            `${relativePath}${line}${column}: [${diagnostic.id}] ${diagnostic.message}`,
          ),
        ),
      );
    }
    return 1;
  }

  logger.error(
    bold(red(
      `${target ? target : "deno.json(c)"} is not found`,
    )),
  );
  return 1;
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
