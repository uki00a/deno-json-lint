# deno-json-lint

A linter for `deno.json`.

## Usage

```shell
$ deno run --allow-read=deno.json jsr:@uki00a/deno-json-lint
```

## Rules

See [docs/rules.md](./docs/rules.md).

## Configuration

You can configure `deno-json-lint` using `"deno-json-lint"` key in
`deno.json(c)`.

Example:

```json
{
  "lock": false,
  "deno-json-lint": {
    "rules": {
      "require-lockfile": "off",
      "require-minimum-dependency-age": "warn"
    }
  }
}
```
