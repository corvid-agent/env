# @corvid-agent/env

[![CI](https://github.com/corvid-agent/env/actions/workflows/ci.yml/badge.svg)](https://github.com/corvid-agent/env/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@corvid-agent/env)](https://www.npmjs.com/package/@corvid-agent/env)
![zero deps](https://img.shields.io/badge/dependencies-0-brightgreen)

Type-safe environment variable parsing with validation, defaults, and transforms. Zero dependencies. TypeScript-first.

## Install

```bash
npm install @corvid-agent/env
```

## Usage

### Quick Helpers

```ts
import { envString, envNumber, envBool, envPort, envUrl, envEnum } from "@corvid-agent/env";

const host = envString("HOST", "localhost");
const port = envPort("PORT", 3000);
const debug = envBool("DEBUG", false);
const dbUrl = envUrl("DATABASE_URL");
const nodeEnv = envEnum("NODE_ENV", ["development", "production", "test"], "development");
```

### Schema Validation

Parse and validate all env vars at once. Errors are collected and reported together:

```ts
import { envSchema } from "@corvid-agent/env";

const config = envSchema({
  PORT: { key: "PORT", type: "port", default: 3000 },
  DATABASE_URL: { key: "DATABASE_URL", type: "url" },
  NODE_ENV: {
    key: "NODE_ENV",
    type: "enum",
    choices: ["development", "production", "test"] as const,
    default: "development",
  },
  DEBUG: { key: "DEBUG", type: "boolean", default: false },
  REDIS_CONFIG: { key: "REDIS_CONFIG", type: "json", required: false },
});

// config is fully typed!
// config.PORT    → number
// config.DEBUG   → boolean
```

### Single Variable

```ts
import { env } from "@corvid-agent/env";

const port = env({ key: "PORT", type: "port", default: 3000 });
const secret = env({
  key: "API_SECRET",
  validate: (v) => (v as string).length >= 32 || "Secret must be at least 32 chars",
});
```

### Custom Transforms

```ts
const tags = env({
  key: "TAGS",
  type: "string",
  transform: (v) => (v as string).split(",").map(s => s.trim()),
});
```

## Supported Types

| Type | Parses to | Example |
|------|-----------|---------|
| `string` | `string` | `"hello"` |
| `number` | `number` | `"42"`, `"3.14"` |
| `boolean` | `boolean` | `"true"`, `"1"`, `"yes"`, `"on"` |
| `json` | `unknown` | `'{"a":1}'` |
| `url` | `string` | `"https://example.com"` |
| `port` | `number` | `"3000"` (0-65535) |
| `enum` | `string` | Must match `choices` |

## Error Handling

Individual errors throw `EnvError`. Schema validation collects all errors into `EnvValidationError`:

```ts
import { EnvValidationError } from "@corvid-agent/env";

try {
  const config = envSchema({ ... });
} catch (err) {
  if (err instanceof EnvValidationError) {
    for (const e of err.errors) {
      console.error(`${e.key}: ${e.errors.join(", ")}`);
    }
  }
}
```

## License

MIT
