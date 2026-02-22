import { describe, expect, it } from "vitest";
import type { OneBotMessage } from "./onebot-types.js";
import {
  normalizeNapCatQQAllowEntry,
  normalizeNapCatQQMessagingTarget,
  isGroupTarget,
  isPrivateTarget,
  parseTarget,
  extractTextFromMessage,
  extractMentionsFromMessage,
  extractReplyFromMessage,
  buildTextSegment,
  buildAtSegment,
  buildAtAllSegment,
  buildReplySegment,
  buildDiceSegment,
  buildRPSSegment,
  buildMessage,
  formatQQDisplay,
  formatGroupDisplay,
} from "./normalize.js";

describe("napcatqq normalize", () => {
  describe("normalizeNapCatQQAllowEntry", () => {
    it("normalizes number entries", () => {
      expect(normalizeNapCatQQAllowEntry(123456789)).toBe(123456789);
    });

    it("normalizes string number entries", () => {
      expect(normalizeNapCatQQAllowEntry("123456789")).toBe(123456789);
    });

    it("normalizes string entries", () => {
      expect(normalizeNapCatQQAllowEntry("test_user")).toBe("test_user");
    });

    it("returns null for empty strings", () => {
      expect(normalizeNapCatQQAllowEntry("")).toBeNull();
      expect(normalizeNapCatQQAllowEntry("   ")).toBeNull();
    });

    it("returns null for non-string/non-number", () => {
      expect(normalizeNapCatQQAllowEntry(null)).toBeNull();
      expect(normalizeNapCatQQAllowEntry(undefined)).toBeNull();
      expect(normalizeNapCatQQAllowEntry({})).toBeNull();
    });
  });

  describe("normalizeNapCatQQMessagingTarget", () => {
    it("normalizes user targets", () => {
      expect(normalizeNapCatQQMessagingTarget("user:123456789")).toBe("user:123456789");
    });

    it("normalizes group targets", () => {
      expect(normalizeNapCatQQMessagingTarget("group:987654321")).toBe("group:987654321");
    });

    it("normalizes numeric targets", () => {
      expect(normalizeNapCatQQMessagingTarget("123456789")).toBe("123456789");
    });

    it("returns null for empty input", () => {
      expect(normalizeNapCatQQMessagingTarget("")).toBeNull();
      expect(normalizeNapCatQQMessagingTarget("   ")).toBeNull();
    });
  });

  describe("isGroupTarget", () => {
    it("returns true for group targets", () => {
      expect(isGroupTarget("group:123456789")).toBe(true);
    });

    it("returns false for non-group targets", () => {
      expect(isGroupTarget("user:123456789")).toBe(false);
      expect(isGroupTarget("123456789")).toBe(false);
    });
  });

  describe("isPrivateTarget", () => {
    it("returns true for user targets", () => {
      expect(isPrivateTarget("user:123456789")).toBe(true);
    });

    it("returns false for non-user targets", () => {
      expect(isPrivateTarget("group:123456789")).toBe(false);
      expect(isPrivateTarget("123456789")).toBe(false);
    });
  });

  describe("parseTarget", () => {
    it("parses user targets", () => {
      expect(parseTarget("user:123456789")).toEqual({ type: "user", id: "123456789" });
    });

    it("parses group targets", () => {
      expect(parseTarget("group:987654321")).toEqual({ type: "group", id: "987654321" });
    });

    it("parses numeric targets as user", () => {
      expect(parseTarget("123456789")).toEqual({ type: "user", id: "123456789" });
    });

    it("returns null for invalid targets", () => {
      expect(parseTarget("invalid")).toBeNull();
    });
  });

  describe("extractTextFromMessage", () => {
    it("extracts text from message segments", () => {
      const message = [
        { type: "text" as const, data: { text: "Hello " } },
        { type: "text" as const, data: { text: "World" } },
      ] as OneBotMessage;
      expect(extractTextFromMessage(message)).toBe("Hello World");
    });

    it("returns empty string for non-text segments", () => {
      const message = [
        { type: "image" as const, data: { url: "http://example.com/image.png" } },
      ] as OneBotMessage;
      expect(extractTextFromMessage(message)).toBe("");
    });
  });

  describe("extractMentionsFromMessage", () => {
    it("extracts mentions from message", () => {
      const message = [
        { type: "at" as const, data: { qq: 123456789 } },
        { type: "at" as const, data: { qq: 987654321 } },
      ] as OneBotMessage;
      const mentions = extractMentionsFromMessage(message);
      expect(mentions).toHaveLength(2);
      expect(mentions[0]).toEqual({ userId: "123456789", qq: 123456789 });
    });

    it("filters out @all mentions", () => {
      const message = [
        { type: "at" as const, data: { qq: "all" } },
        { type: "at" as const, data: { qq: 123456789 } },
      ] as OneBotMessage;
      const mentions = extractMentionsFromMessage(message);
      expect(mentions).toHaveLength(1);
    });
  });

  describe("extractReplyFromMessage", () => {
    it("extracts reply from message", () => {
      const message = [
        { type: "reply" as const, data: { id: "12345" } },
        { type: "text" as const, data: { text: "Reply text" } },
      ] as OneBotMessage;
      expect(extractReplyFromMessage(message)).toEqual({ messageId: "12345" });
    });

    it("returns null when no reply segment", () => {
      const message = [
        { type: "text" as const, data: { text: "No reply" } },
      ] as OneBotMessage;
      expect(extractReplyFromMessage(message)).toBeNull();
    });
  });

  describe("buildTextSegment", () => {
    it("builds text segment", () => {
      expect(buildTextSegment("Hello")).toEqual({
        type: "text",
        data: { text: "Hello" },
      });
    });
  });

  describe("buildAtSegment", () => {
    it("builds at segment with number", () => {
      expect(buildAtSegment(123456789)).toEqual({
        type: "at",
        data: { qq: 123456789 },
      });
    });

    it("builds at segment with string", () => {
      expect(buildAtSegment("123456789")).toEqual({
        type: "at",
        data: { qq: 123456789 },
      });
    });
  });

  describe("buildAtAllSegment", () => {
    it("builds at all segment", () => {
      expect(buildAtAllSegment()).toEqual({
        type: "at",
        data: { qq: "all" },
      });
    });
  });

  describe("buildReplySegment", () => {
    it("builds reply segment", () => {
      expect(buildReplySegment("12345")).toEqual({
        type: "reply",
        data: { id: "12345" },
      });
    });
  });

  describe("buildDiceSegment", () => {
    it("builds dice segment with result", () => {
      expect(buildDiceSegment(6)).toEqual({
        type: "dice",
        data: { result: 6 },
      });
    });

    it("builds dice segment without result", () => {
      expect(buildDiceSegment()).toEqual({
        type: "dice",
        data: {},
      });
    });
  });

  describe("buildRPSSegment", () => {
    it("builds rps segment with result", () => {
      expect(buildRPSSegment(1)).toEqual({
        type: "rps",
        data: { result: 1 },
      });
    });

    it("builds rps segment without result", () => {
      expect(buildRPSSegment()).toEqual({
        type: "rps",
        data: {},
      });
    });
  });

  describe("buildMessage", () => {
    it("builds message from segments", () => {
      const segments = [
        buildTextSegment("Hello"),
        buildAtSegment(123456789),
      ];
      expect(buildMessage(segments)).toEqual(segments);
    });
  });

  describe("formatQQDisplay", () => {
    it("formats with nickname", () => {
      expect(formatQQDisplay(123456789, "Alice")).toBe("Alice(123456789)");
    });

    it("formats without nickname", () => {
      expect(formatQQDisplay(123456789)).toBe("123456789");
    });

    it("formats string id with nickname", () => {
      expect(formatQQDisplay("123456789", "Bob")).toBe("Bob(123456789)");
    });
  });

  describe("formatGroupDisplay", () => {
    it("formats with group name", () => {
      expect(formatGroupDisplay(987654321, "Test Group")).toBe("Test Group(987654321)");
    });

    it("formats without group name", () => {
      expect(formatGroupDisplay(987654321)).toBe("群987654321");
    });
  });
});
