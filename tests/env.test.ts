import { describe, test, expect } from "bun:test";
import {
  env,
  envSchema,
  envString,
  envNumber,
  envBool,
  envPort,
  envUrl,
  envJson,
  envEnum,
  EnvError,
  EnvValidationError,
} from "../src/index";

// Helper to create a mock env source
const mockEnv = (vars: Record<string, string>) => vars;

// ── env() single var ───────────────────────────────────────────────────

describe("env", () => {
  test("parses string", () => {
    const result = env({ key: "FOO", type: "string" }, mockEnv({ FOO: "bar" }));
    expect(result).toBe("bar");
  });

  test("parses number", () => {
    const result = env({ key: "PORT", type: "number" }, mockEnv({ PORT: "3000" }));
    expect(result).toBe(3000);
  });

  test("parses negative number", () => {
    const result = env({ key: "N", type: "number" }, mockEnv({ N: "-42" }));
    expect(result).toBe(-42);
  });

  test("parses float number", () => {
    const result = env({ key: "F", type: "number" }, mockEnv({ F: "3.14" }));
    expect(result).toBe(3.14);
  });

  test("throws on invalid number", () => {
    expect(() => {
      env({ key: "N", type: "number" }, mockEnv({ N: "abc" }));
    }).toThrow(EnvError);
  });

  test("parses boolean true values", () => {
    for (const val of ["true", "TRUE", "1", "yes", "YES", "on", "ON"]) {
      const result = env({ key: "B", type: "boolean" }, mockEnv({ B: val }));
      expect(result).toBe(true);
    }
  });

  test("parses boolean false values", () => {
    for (const val of ["false", "FALSE", "0", "no", "NO", "off", "OFF"]) {
      const result = env({ key: "B", type: "boolean" }, mockEnv({ B: val }));
      expect(result).toBe(false);
    }
  });

  test("throws on invalid boolean", () => {
    expect(() => {
      env({ key: "B", type: "boolean" }, mockEnv({ B: "maybe" }));
    }).toThrow(EnvError);
  });

  test("parses JSON", () => {
    const result = env({ key: "J", type: "json" }, mockEnv({ J: '{"a":1}' }));
    expect(result).toEqual({ a: 1 });
  });

  test("throws on invalid JSON", () => {
    expect(() => {
      env({ key: "J", type: "json" }, mockEnv({ J: "not json" }));
    }).toThrow(EnvError);
  });

  test("parses URL", () => {
    const result = env(
      { key: "U", type: "url" },
      mockEnv({ U: "https://example.com" }),
    );
    expect(result).toBe("https://example.com");
  });

  test("throws on invalid URL", () => {
    expect(() => {
      env({ key: "U", type: "url" }, mockEnv({ U: "not-a-url" }));
    }).toThrow(EnvError);
  });

  test("parses port", () => {
    const result = env({ key: "P", type: "port" }, mockEnv({ P: "8080" }));
    expect(result).toBe(8080);
  });

  test("throws on invalid port (too high)", () => {
    expect(() => {
      env({ key: "P", type: "port" }, mockEnv({ P: "99999" }));
    }).toThrow(EnvError);
  });

  test("throws on invalid port (negative)", () => {
    expect(() => {
      env({ key: "P", type: "port" }, mockEnv({ P: "-1" }));
    }).toThrow(EnvError);
  });

  test("validates port 0", () => {
    const result = env({ key: "P", type: "port" }, mockEnv({ P: "0" }));
    expect(result).toBe(0);
  });

  test("validates port 65535", () => {
    const result = env({ key: "P", type: "port" }, mockEnv({ P: "65535" }));
    expect(result).toBe(65535);
  });
});

// ── Defaults and Required ──────────────────────────────────────────────

describe("defaults and required", () => {
  test("uses default when not set", () => {
    const result = env({ key: "MISSING", type: "number", default: 42 }, mockEnv({}));
    expect(result).toBe(42);
  });

  test("uses default when empty string", () => {
    const result = env({ key: "EMPTY", type: "string", default: "fallback" }, mockEnv({ EMPTY: "" }));
    expect(result).toBe("fallback");
  });

  test("throws when required and not set", () => {
    expect(() => {
      env({ key: "REQUIRED" }, mockEnv({}));
    }).toThrow(EnvError);
  });

  test("returns undefined when not required and not set", () => {
    const result = env({ key: "OPT", required: false }, mockEnv({}));
    expect(result).toBeUndefined();
  });

  test("actual value overrides default", () => {
    const result = env(
      { key: "V", type: "number", default: 100 },
      mockEnv({ V: "200" }),
    );
    expect(result).toBe(200);
  });
});

// ── Enum ───────────────────────────────────────────────────────────────

describe("enum", () => {
  test("accepts valid choice", () => {
    const result = env(
      { key: "E", type: "enum", choices: ["a", "b", "c"] as const },
      mockEnv({ E: "b" }),
    );
    expect(result).toBe("b");
  });

  test("rejects invalid choice", () => {
    expect(() => {
      env(
        { key: "E", type: "enum", choices: ["a", "b", "c"] as const },
        mockEnv({ E: "d" }),
      );
    }).toThrow(EnvError);
  });
});

// ── Validation and Transform ───────────────────────────────────────────

describe("validation and transform", () => {
  test("custom validate (returns boolean)", () => {
    expect(() => {
      env(
        { key: "N", type: "number", validate: (v) => (v as number) > 0 },
        mockEnv({ N: "-5" }),
      );
    }).toThrow(EnvError);
  });

  test("custom validate (returns string error)", () => {
    try {
      env(
        {
          key: "N",
          type: "number",
          validate: (v) => (v as number) > 0 || "Must be positive",
        },
        mockEnv({ N: "-5" }),
      );
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      expect((err as EnvError).message).toContain("Must be positive");
    }
  });

  test("custom validate passes", () => {
    const result = env(
      { key: "N", type: "number", validate: (v) => (v as number) > 0 },
      mockEnv({ N: "42" }),
    );
    expect(result).toBe(42);
  });

  test("transform modifies value", () => {
    const result = env(
      {
        key: "S",
        type: "string",
        transform: (v) => (v as string).toUpperCase(),
      },
      mockEnv({ S: "hello" }),
    );
    expect(result).toBe("HELLO");
  });

  test("transform runs before validate", () => {
    const result = env(
      {
        key: "N",
        type: "number",
        transform: (v) => Math.abs(v as number) as any,
        validate: (v) => (v as number) > 0,
      },
      mockEnv({ N: "-5" }),
    );
    expect(result).toBe(5);
  });
});

// ── envSchema ──────────────────────────────────────────────────────────

describe("envSchema", () => {
  test("parses multiple vars", () => {
    const config = envSchema(
      {
        PORT: { key: "PORT", type: "port", default: 3000 },
        HOST: { key: "HOST", type: "string", default: "localhost" },
        DEBUG: { key: "DEBUG", type: "boolean", default: false },
      },
      mockEnv({ PORT: "8080" }),
    );

    expect(config.PORT).toBe(8080);
    expect(config.HOST).toBe("localhost");
    expect(config.DEBUG).toBe(false);
  });

  test("collects all errors", () => {
    try {
      envSchema(
        {
          A: { key: "A", type: "number" },
          B: { key: "B", type: "url" },
          C: { key: "C", type: "port" },
        },
        mockEnv({}),
      );
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      const ve = err as EnvValidationError;
      expect(ve.errors).toHaveLength(3);
    }
  });

  test("shorthand type strings work", () => {
    const config = envSchema(
      {
        FOO: "string",
        BAR: "number",
      },
      mockEnv({ FOO: "hello", BAR: "42" }),
    );

    expect(config.FOO).toBe("hello");
    expect(config.BAR).toBe(42);
  });
});

// ── Quick helpers ──────────────────────────────────────────────────────

describe("quick helpers", () => {
  // We'll set process.env temporarily for these tests
  const origEnv = { ...process.env };

  test("envString", () => {
    process.env.TEST_STR = "hello";
    expect(envString("TEST_STR")).toBe("hello");
    delete process.env.TEST_STR;
  });

  test("envString with default", () => {
    expect(envString("NOPE", "fallback")).toBe("fallback");
  });

  test("envNumber", () => {
    process.env.TEST_NUM = "42";
    expect(envNumber("TEST_NUM")).toBe(42);
    delete process.env.TEST_NUM;
  });

  test("envBool", () => {
    process.env.TEST_BOOL = "true";
    expect(envBool("TEST_BOOL")).toBe(true);
    delete process.env.TEST_BOOL;
  });

  test("envPort", () => {
    process.env.TEST_PORT = "3000";
    expect(envPort("TEST_PORT")).toBe(3000);
    delete process.env.TEST_PORT;
  });

  test("envUrl", () => {
    process.env.TEST_URL = "https://example.com";
    expect(envUrl("TEST_URL")).toBe("https://example.com");
    delete process.env.TEST_URL;
  });

  test("envJson", () => {
    process.env.TEST_JSON = '{"x":1}';
    expect(envJson("TEST_JSON")).toEqual({ x: 1 });
    delete process.env.TEST_JSON;
  });

  test("envEnum", () => {
    process.env.TEST_ENUM = "prod";
    expect(envEnum("TEST_ENUM", ["dev", "prod", "test"] as const)).toBe("prod");
    delete process.env.TEST_ENUM;
  });
});
