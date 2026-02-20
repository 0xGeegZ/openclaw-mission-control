/**
 * Tests for runtime config loading (OpenClaw gateway URL protocol restriction).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../config";

const requiredEnv: Record<string, string> = {
  ACCOUNT_ID: "jd7abc1234567890",
  CONVEX_URL: "https://example.convex.cloud",
  SERVICE_TOKEN: "mc_service_jd7abc1234567890_testsecret",
};

let originalEnv: typeof process.env;
beforeEach(() => {
  originalEnv = { ...process.env };
  Object.entries(requiredEnv).forEach(([k, v]) => {
    process.env[k] = v;
  });
});
afterEach(() => {
  process.env = originalEnv;
});

describe("loadConfig – OPENCLAW_GATEWAY_URL protocol", () => {
  it("rejects file:// URL", async () => {
    process.env.OPENCLAW_GATEWAY_URL = "file:///etc/passwd";
    await expect(loadConfig()).rejects.toThrow(
      /Only http and https are allowed/,
    );
  });

  it("rejects ftp:// URL", async () => {
    process.env.OPENCLAW_GATEWAY_URL = "ftp://host/path";
    await expect(loadConfig()).rejects.toThrow(
      /Only http and https are allowed/,
    );
  });

  it("accepts http URL", async () => {
    process.env.OPENCLAW_GATEWAY_URL = "http://127.0.0.1:18789";
    const config = await loadConfig();
    expect(config.openclawGatewayUrl).toBe("http://127.0.0.1:18789");
  });

  it("accepts https URL", async () => {
    process.env.OPENCLAW_GATEWAY_URL = "https://gateway.example.com";
    process.env.OPENCLAW_GATEWAY_TOKEN = "token-for-https";
    const config = await loadConfig();
    expect(config.openclawGatewayUrl).toBe("https://gateway.example.com");
  });
});
