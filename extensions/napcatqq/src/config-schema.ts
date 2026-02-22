import {
  BlockStreamingCoalesceSchema,
  DmConfigSchema,
  DmPolicySchema,
  GroupPolicySchema,
  MarkdownConfigSchema,
  ToolPolicySchema,
  requireOpenAllowFrom,
} from "openclaw/plugin-sdk";
import { z } from "zod";

const NapCatQQGroupSchema = z
  .object({
    requireMention: z.boolean().optional(),
    tools: ToolPolicySchema,
    toolsBySender: z.record(z.string(), ToolPolicySchema).optional(),
    skills: z.array(z.string()).optional(),
    enabled: z.boolean().optional(),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    systemPrompt: z.string().optional(),
  })
  .strict();

export const NapCatQQAccountSchemaBase = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    wsPort: z.number().int().min(1).max(65535).optional(),
    wsHost: z.string().optional(),
    wsPath: z.string().optional(),
    accessToken: z.string().optional(),
    dmPolicy: DmPolicySchema.optional().default("pairing"),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    defaultTo: z.string().optional(),
    groupPolicy: GroupPolicySchema.optional().default("allowlist"),
    groupAllowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    groups: z.record(z.string(), NapCatQQGroupSchema.optional()).optional(),
    mentionPatterns: z.array(z.string()).optional(),
    markdown: MarkdownConfigSchema,
    historyLimit: z.number().int().min(0).optional(),
    dmHistoryLimit: z.number().int().min(0).optional(),
    dms: z.record(z.string(), DmConfigSchema.optional()).optional(),
    textChunkLimit: z.number().int().positive().optional(),
    blockStreamingCoalesce: BlockStreamingCoalesceSchema.optional(),
    mediaMaxMb: z.number().positive().optional(),
  })
  .strict();

export const NapCatQQAccountSchema = NapCatQQAccountSchemaBase.superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message: 'channels.napcatqq.dmPolicy="open" requires channels.napcatqq.allowFrom to include "*"',
  });
});

export const NapCatQQConfigSchema = NapCatQQAccountSchemaBase.extend({
  accounts: z.record(z.string(), NapCatQQAccountSchema.optional()).optional(),
}).superRefine((value, ctx) => {
  requireOpenAllowFrom({
    policy: value.dmPolicy,
    allowFrom: value.allowFrom,
    ctx,
    path: ["allowFrom"],
    message: 'channels.napcatqq.dmPolicy="open" requires channels.napcatqq.allowFrom to include "*"',
  });
});
