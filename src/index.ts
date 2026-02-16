/**
 * @corvid-agent/env
 *
 * Type-safe environment variable parsing with validation, defaults, and transforms.
 * Zero dependencies. TypeScript-first.
 */

// ── Types ──────────────────────────────────────────────────────────────

export type EnvType = "string" | "number" | "boolean" | "json" | "url" | "port" | "enum";

export interface EnvVarConfig<T = unknown> {
  /** Environment variable name */
  key: string;
  /** Expected type (default: "string") */
  type?: EnvType;
  /** Default value if not set */
  default?: T;
  /** Whether the variable is required (default: true if no default) */
  required?: boolean;
  /** Custom validation function */
  validate?: (value: T) => boolean | string;
  /** Custom transform applied after type coercion */
  transform?: (value: T) => T;
  /** Allowed values for enum type */
  choices?: readonly T[];
  /** Description for error messages and documentation */
  description?: string;
}

export interface EnvSchema {
  [key: string]: EnvVarConfig | EnvType | string;
}

type InferType<T extends EnvVarConfig | EnvType | string> =
  T extends EnvVarConfig<infer U> ? (T extends { required: false; default?: undefined } ? U | undefined : U) :
  T extends "number" | "port" ? number :
  T extends "boolean" ? boolean :
  T extends "json" ? unknown :
  string;

export type InferEnv<S extends EnvSchema> = {
  [K in keyof S]: InferType<S[K]>;
};

// ── Errors ─────────────────────────────────────────────────────────────

export class EnvError extends Error {
  readonly key: string;
  readonly errors: string[];

  constructor(key: string, errors: string[]) {
    super(`Environment variable "${key}": ${errors.join("; ")}`);
    this.name = "EnvError";
    this.key = key;
    this.errors = errors;
  }
}

export class EnvValidationError extends Error {
  readonly errors: EnvError[];

  constructor(errors: EnvError[]) {
    const msg = errors.map((e) => e.message).join("\n");
    super(`Environment validation failed:\n${msg}`);
    this.name = "EnvValidationError";
    this.errors = errors;
  }
}

// ── Parsers ────────────────────────────────────────────────────────────

function parseString(raw: string): string {
  return raw;
}

function parseNumber(raw: string, key: string): number {
  const num = Number(raw);
  if (isNaN(num)) {
    throw new EnvError(key, [`Expected a number, got "${raw}"`]);
  }
  return num;
}

function parseBoolean(raw: string, key: string): boolean {
  const lower = raw.toLowerCase().trim();
  if (["true", "1", "yes", "on"].includes(lower)) return true;
  if (["false", "0", "no", "off"].includes(lower)) return false;
  throw new EnvError(key, [`Expected a boolean, got "${raw}". Use true/false, 1/0, yes/no, or on/off`]);
}

function parseJson(raw: string, key: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new EnvError(key, [`Expected valid JSON, got "${raw}"`]);
  }
}

function parseUrl(raw: string, key: string): string {
  try {
    new URL(raw);
    return raw;
  } catch {
    throw new EnvError(key, [`Expected a valid URL, got "${raw}"`]);
  }
}

function parsePort(raw: string, key: string): number {
  const num = Number(raw);
  if (isNaN(num) || !Number.isInteger(num) || num < 0 || num > 65535) {
    throw new EnvError(key, [`Expected a port (0-65535), got "${raw}"`]);
  }
  return num;
}

// ── Core ───────────────────────────────────────────────────────────────

function normalizeConfig(input: EnvVarConfig | EnvType | string, key: string): EnvVarConfig {
  if (typeof input === "string") {
    // Could be a type like "number" or just the env var key
    const validTypes: EnvType[] = ["string", "number", "boolean", "json", "url", "port", "enum"];
    if (validTypes.includes(input as EnvType)) {
      return { key, type: input as EnvType };
    }
    return { key, type: "string" };
  }
  return { ...input, key: input.key || key };
}

function parseValue(raw: string, config: EnvVarConfig): unknown {
  const type = config.type || "string";
  const key = config.key;

  switch (type) {
    case "string": return parseString(raw);
    case "number": return parseNumber(raw, key);
    case "boolean": return parseBoolean(raw, key);
    case "json": return parseJson(raw, key);
    case "url": return parseUrl(raw, key);
    case "port": return parsePort(raw, key);
    case "enum": return parseString(raw);
    default: return raw;
  }
}

/**
 * Parse a single environment variable.
 *
 * @example
 * ```ts
 * import { env } from "@corvid-agent/env";
 *
 * const port = env({ key: "PORT", type: "port", default: 3000 });
 * const dbUrl = env({ key: "DATABASE_URL", type: "url" });
 * ```
 */
export function env<T = string>(config: EnvVarConfig<T>, source?: Record<string, string | undefined>): T {
  // Cast to any-typed config internally to avoid TS variance issues
  const cfg = config as EnvVarConfig<any>;
  const src = source ?? process.env;
  const raw = src[config.key];

  if (raw === undefined || raw === "") {
    if (config.default !== undefined) {
      return config.default;
    }
    if (config.required === false) {
      return undefined as T;
    }
    throw new EnvError(config.key, ["Required but not set"]);
  }

  let value = parseValue(raw, cfg) as T;

  // Enum validation
  if (config.type === "enum" && config.choices) {
    if (!config.choices.includes(value)) {
      throw new EnvError(config.key, [
        `Expected one of [${config.choices.join(", ")}], got "${raw}"`,
      ]);
    }
  }

  // Custom transform
  if (config.transform) {
    value = config.transform(value);
  }

  // Custom validation
  if (config.validate) {
    const result = config.validate(value);
    if (result === false) {
      throw new EnvError(config.key, ["Failed custom validation"]);
    }
    if (typeof result === "string") {
      throw new EnvError(config.key, [result]);
    }
  }

  return value;
}

/**
 * Parse multiple environment variables from a schema.
 * Collects all errors and throws them together.
 *
 * @example
 * ```ts
 * import { envSchema } from "@corvid-agent/env";
 *
 * const config = envSchema({
 *   PORT: { key: "PORT", type: "port", default: 3000 },
 *   DATABASE_URL: { key: "DATABASE_URL", type: "url" },
 *   NODE_ENV: {
 *     key: "NODE_ENV",
 *     type: "enum",
 *     choices: ["development", "production", "test"] as const,
 *     default: "development",
 *   },
 *   DEBUG: { key: "DEBUG", type: "boolean", default: false },
 * });
 *
 * // config is fully typed:
 * // { PORT: number, DATABASE_URL: string, NODE_ENV: "development" | "production" | "test", DEBUG: boolean }
 * ```
 */
export function envSchema<S extends EnvSchema>(
  schema: S,
  source?: Record<string, string | undefined>,
): InferEnv<S> {
  const result: Record<string, unknown> = {};
  const errors: EnvError[] = [];

  for (const [name, rawConfig] of Object.entries(schema)) {
    const config = normalizeConfig(rawConfig, name);
    try {
      result[name] = env(config, source);
    } catch (err) {
      if (err instanceof EnvError) {
        errors.push(err);
      } else {
        throw err;
      }
    }
  }

  if (errors.length > 0) {
    throw new EnvValidationError(errors);
  }

  return result as InferEnv<S>;
}

// ── Quick helpers ──────────────────────────────────────────────────────

/** Get a required string env var */
export function envString(key: string, defaultValue?: string): string {
  return env({ key, type: "string", default: defaultValue });
}

/** Get a required number env var */
export function envNumber(key: string, defaultValue?: number): number {
  return env({ key, type: "number", default: defaultValue });
}

/** Get a required boolean env var */
export function envBool(key: string, defaultValue?: boolean): boolean {
  return env({ key, type: "boolean", default: defaultValue });
}

/** Get a required port env var (0-65535) */
export function envPort(key: string, defaultValue?: number): number {
  return env({ key, type: "port", default: defaultValue });
}

/** Get a required URL env var */
export function envUrl(key: string, defaultValue?: string): string {
  return env({ key, type: "url", default: defaultValue });
}

/** Get a required JSON env var */
export function envJson<T = unknown>(key: string, defaultValue?: T): T {
  return env({ key, type: "json", default: defaultValue });
}

/** Get a required enum env var */
export function envEnum<T extends string>(
  key: string,
  choices: readonly T[],
  defaultValue?: T,
): T {
  return env({ key, type: "enum", choices, default: defaultValue }) as T;
}
