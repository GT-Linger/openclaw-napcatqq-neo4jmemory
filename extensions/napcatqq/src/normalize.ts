import type { OneBotMessage, OneBotMessageSegment, OneBotMessageEvent } from "./onebot-types.js";

export function normalizeNapCatQQAllowEntry(entry: unknown): string | number | null {
  if (typeof entry === "number") {
    return entry;
  }
  if (typeof entry === "string") {
    const trimmed = entry.trim();
    if (!trimmed) {
      return null;
    }
    const num = Number.parseInt(trimmed, 10);
    if (!Number.isNaN(num)) {
      return num;
    }
    return trimmed;
  }
  return null;
}

export function normalizeNapCatQQMessagingTarget(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("user:")) {
    return trimmed;
  }
  if (trimmed.startsWith("group:")) {
    return trimmed;
  }
  const num = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(num)) {
    return String(num);
  }
  return null;
}

export function isGroupTarget(target: string): boolean {
  return target.startsWith("group:");
}

export function isPrivateTarget(target: string): boolean {
  return target.startsWith("user:");
}

export function parseTarget(target: string): { type: "user" | "group"; id: string } | null {
  if (target.startsWith("user:")) {
    return { type: "user", id: target.slice(5) };
  }
  if (target.startsWith("group:")) {
    return { type: "group", id: target.slice(6) };
  }
  const num = Number.parseInt(target, 10);
  if (!Number.isNaN(num)) {
    return { type: "user", id: String(num) };
  }
  return null;
}

export function extractTextFromMessage(message: OneBotMessage | OneBotMessageEvent): string {
  const segments = Array.isArray(message) ? message : (message.message as OneBotMessage);
  const parts: string[] = [];
  for (const segment of segments) {
    if (segment.type === "text") {
      const text = segment.data.text;
      if (typeof text === "string") {
        parts.push(text);
      }
    }
  }
  return parts.join("").trim();
}

export function extractMentionsFromMessage(message: OneBotMessage | OneBotMessageEvent): Array<{ userId: string; qq: number }> {
  const segments = Array.isArray(message) ? message : (message.message as OneBotMessage);
  const mentions: Array<{ userId: string; qq: number }> = [];
  for (const segment of segments) {
    if (segment.type === "at") {
      const qq = segment.data.qq;
      if (typeof qq === "number" && qq > 0) {
        mentions.push({ userId: String(qq), qq });
      } else if (typeof qq === "string" && qq !== "all") {
        const num = Number.parseInt(qq, 10);
        if (!Number.isNaN(num) && num > 0) {
          mentions.push({ userId: qq, qq: num });
        }
      }
    }
  }
  return mentions;
}

export function extractReplyFromMessage(message: OneBotMessage | OneBotMessageEvent): { messageId: string } | null {
  const segments = Array.isArray(message) ? message : (message.message as OneBotMessage);
  for (const segment of segments) {
    if (segment.type === "reply") {
      const id = segment.data.id;
      if (id !== undefined && id !== null) {
        return { messageId: String(id) };
      }
    }
  }
  return null;
}

export function extractImagesFromMessage(message: OneBotMessage | OneBotMessageEvent): Array<{ url: string; file?: string }> {
  const segments = Array.isArray(message) ? message : (message.message as OneBotMessage);
  const images: Array<{ url: string; file?: string }> = [];
  for (const segment of segments) {
    if (segment.type === "image") {
      const data = segment.data;
      images.push({
        url: typeof data.url === "string" ? data.url : "",
        file: typeof data.file === "string" ? data.file : undefined,
      });
    }
  }
  return images;
}

export function extractFilesFromMessage(message: OneBotMessage | OneBotMessageEvent): Array<{ file: string; name?: string }> {
  const segments = Array.isArray(message) ? message : (message.message as OneBotMessage);
  const files: Array<{ file: string; name?: string }> = [];
  for (const segment of segments) {
    if (segment.type === "file") {
      const data = segment.data;
      if (typeof data.file === "string") {
        files.push({
          file: data.file,
          name: typeof data.name === "string" ? data.name : undefined,
        });
      }
    }
  }
  return files;
}

export function buildTextSegment(text: string): OneBotMessageSegment {
  return { type: "text", data: { text } };
}

export function buildAtSegment(userId: number | string): OneBotMessageSegment {
  return { type: "at", data: { qq: typeof userId === "string" ? Number.parseInt(userId, 10) : userId } };
}

export function buildAtAllSegment(): OneBotMessageSegment {
  return { type: "at", data: { qq: "all" } };
}

export function buildReplySegment(messageId: string | number): OneBotMessageSegment {
  return { type: "reply", data: { id: String(messageId) } };
}

export function buildImageSegment(url: string, file?: string): OneBotMessageSegment {
  return { type: "image", data: { url, file } };
}

export function buildFileSegment(file: string, name?: string): OneBotMessageSegment {
  return { type: "file", data: { file, name: name || file.split("/").pop() || "file" } };
}

export function buildMarkdownSegment(content: string): OneBotMessageSegment {
  return { type: "markdown", data: { content } };
}

export function buildDiceSegment(result?: number | string): OneBotMessageSegment {
  return { type: "dice", data: result !== undefined ? { result } : {} };
}

export function buildRPSSegment(result?: number | string): OneBotMessageSegment {
  return { type: "rps", data: result !== undefined ? { result } : {} };
}

export function buildMFaceSegment(
  emojiPackageId: number,
  emojiId: string,
  key: string,
  summary: string,
): OneBotMessageSegment {
  return {
    type: "mface",
    data: {
      emoji_package_id: emojiPackageId,
      emoji_id: emojiId,
      key,
      summary,
    },
  };
}

export function buildJsonSegment(data: string | object, token?: string): OneBotMessageSegment {
  const segment: OneBotMessageSegment = { type: "json", data: { data } };
  if (token) {
    (segment.data as { data: string | object; config?: { token: string } }).config = { token };
  }
  return segment;
}

export function buildXmlSegment(data: string): OneBotMessageSegment {
  return { type: "xml", data: { data } };
}

export function buildLocationSegment(
  lat: number | string,
  lon: number | string,
  title?: string,
  content?: string,
): OneBotMessageSegment {
  return { type: "location", data: { lat, lon, title, content } };
}

export function buildMessage(segments: OneBotMessageSegment[]): OneBotMessageSegment[] {
  return segments;
}

export function formatQQDisplay(id: string | number, nickname?: string): string {
  const idStr = typeof id === "number" ? String(id) : id;
  if (nickname) {
    return `${nickname}(${idStr})`;
  }
  return idStr;
}

export function formatGroupDisplay(groupId: string | number, groupName?: string): string {
  const idStr = typeof groupId === "number" ? String(groupId) : groupId;
  if (groupName) {
    return `${groupName}(${idStr})`;
  }
  return `群${idStr}`;
}
