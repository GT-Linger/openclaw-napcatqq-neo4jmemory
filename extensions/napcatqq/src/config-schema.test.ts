import { describe, expect, it } from "vitest";
import { NapCatQQConfigSchema } from "./config-schema.js";

describe("napcatqq config schema", () => {
  it("accepts basic config", () => {
    const parsed = NapCatQQConfigSchema.parse({
      wsPort: 3001,
      wsHost: "127.0.0.1",
      wsPath: "/onebot/v11/ws",
    });

    expect(parsed.wsPort).toBe(3001);
    expect(parsed.wsHost).toBe("127.0.0.1");
    expect(parsed.wsPath).toBe("/onebot/v11/ws");
  });

  it("accepts numeric allowFrom entries", () => {
    const parsed = NapCatQQConfigSchema.parse({
      dmPolicy: "allowlist",
      allowFrom: [123456789, 987654321],
    });

    expect(parsed.allowFrom).toEqual([123456789, 987654321]);
  });

  it("accepts string allowFrom entries", () => {
    const parsed = NapCatQQConfigSchema.parse({
      dmPolicy: "allowlist",
      allowFrom: ["123456789", "test_user"],
    });

    expect(parsed.allowFrom).toEqual(["123456789", "test_user"]);
  });

  it("accepts group config", () => {
    const parsed = NapCatQQConfigSchema.parse({
      groupPolicy: "allowlist",
      groups: {
        "123456789": {
          requireMention: false,
        },
      },
    });

    expect(parsed.groupPolicy).toBe("allowlist");
    expect(parsed.groups?.["123456789"]?.requireMention).toBe(false);
  });

  it("accepts account config", () => {
    const parsed = NapCatQQConfigSchema.parse({
      accounts: {
        secondary: {
          wsPort: 3002,
          wsHost: "127.0.0.1",
          accessToken: "test_token",
        },
      },
    });

    expect(parsed.accounts?.secondary?.wsPort).toBe(3002);
    expect(parsed.accounts?.secondary?.accessToken).toBe("test_token");
  });

  it("accepts accessToken", () => {
    const parsed = NapCatQQConfigSchema.parse({
      accessToken: "my_secret_token",
    });

    expect(parsed.accessToken).toBe("my_secret_token");
  });

  it("accepts dmPolicy values", () => {
    const policies = ["open", "pairing", "closed"] as const;

    for (const policy of policies) {
      const parsed = NapCatQQConfigSchema.parse({
        dmPolicy: policy,
      });
      expect(parsed.dmPolicy).toBe(policy);
    }
  });

  it("accepts groupPolicy values", () => {
    const policies = ["open", "allowlist", "disabled"] as const;

    for (const policy of policies) {
      const parsed = NapCatQQConfigSchema.parse({
        groupPolicy: policy,
      });
      expect(parsed.groupPolicy).toBe(policy);
    }
  });

  it("accepts historyLimit config", () => {
    const parsed = NapCatQQConfigSchema.parse({
      historyLimit: 100,
      dmHistoryLimit: 50,
    });

    expect(parsed.historyLimit).toBe(100);
    expect(parsed.dmHistoryLimit).toBe(50);
  });

  it("accepts mediaMaxMb config", () => {
    const parsed = NapCatQQConfigSchema.parse({
      mediaMaxMb: 100,
    });

    expect(parsed.mediaMaxMb).toBe(100);
  });

  it("accepts textChunkLimit config", () => {
    const parsed = NapCatQQConfigSchema.parse({
      textChunkLimit: 3000,
    });

    expect(parsed.textChunkLimit).toBe(3000);
  });

  it("accepts mentionPatterns config", () => {
    const parsed = NapCatQQConfigSchema.parse({
      mentionPatterns: ["@bot", "bot:"],
    });

    expect(parsed.mentionPatterns).toEqual(["@bot", "bot:"]);
  });

  it("accepts enabled flag", () => {
    const parsed = NapCatQQConfigSchema.parse({
      enabled: true,
    });

    expect(parsed.enabled).toBe(true);
  });

  it("accepts name for account", () => {
    const parsed = NapCatQQConfigSchema.parse({
      name: "Primary Account",
    });

    expect(parsed.name).toBe("Primary Account");
  });
});
