import type { SubagentConfig, SubagentPersonality } from "./subagent-config.js";
import { getModelManager } from "./model-manager.js";

const ENHANCE_PROMPT_TEMPLATE = `请根据以下子智能体描述，帮助完善其人格特征和工作方式描述。

子智能体名称: {name}
子智能体描述: {description}

请生成一个详细、专业的人格描述，包括：
1. 核心职责和能力
2. 工作风格和特点
3. 适当的限制和边界
4. 与用户互动的方式

请用中文回复，直接返回人格描述，不需要其他解释。`;

const ENHANCE_TIMEOUT_MS = 60000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

export interface EnhancePersonalityOptions {
  subagentName: string;
  subagentDescription: string;
  mainAgentEndpoint?: {
    baseUrl: string;
    model: string;
    apiKey?: string;
  };
  timeoutMs?: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function enhanceSubagentPersonality(
  options: EnhancePersonalityOptions
): Promise<SubagentPersonality> {
  const { subagentName, subagentDescription, mainAgentEndpoint, timeoutMs = ENHANCE_TIMEOUT_MS } = options;

  if (!mainAgentEndpoint) {
    console.log("[PersonalityEnhancer] No main agent endpoint configured, using base description only");
    return {
      base: subagentDescription,
      enhanced: undefined,
      enhancedBy: undefined,
      enhancedAt: undefined,
    };
  }

  if (!mainAgentEndpoint.baseUrl || !mainAgentEndpoint.model) {
    console.log("[PersonalityEnhancer] Invalid main agent endpoint configuration");
    return {
      base: subagentDescription,
      enhanced: undefined,
      enhancedBy: undefined,
      enhancedAt: undefined,
    };
  }

  const prompt = ENHANCE_PROMPT_TEMPLATE
    .replace("{name}", subagentName)
    .replace("{description}", subagentDescription);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`[PersonalityEnhancer] Retry attempt ${attempt}/${MAX_RETRIES}`);
      await sleep(RETRY_DELAY_MS * attempt);
    }

    try {
      const response = await fetchWithTimeout(
        mainAgentEndpoint.baseUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(mainAgentEndpoint.apiKey ? { Authorization: `Bearer ${mainAgentEndpoint.apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: mainAgentEndpoint.model,
            messages: [
              { role: "system", content: "你是一个专业的AI助手，擅长根据简单的描述生成详细的人格特征。" },
              { role: "user", content: prompt },
            ],
            temperature: 0.7,
            max_tokens: 2000,
          }),
        },
        timeoutMs
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`API request failed: ${response.status} - ${errorText.slice(0, 200)}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        content?: string;
        error?: { message?: string };
      };

      if (data.error) {
        throw new Error(`API error: ${data.error.message || "Unknown API error"}`);
      }

      const enhancedContent = data.choices?.[0]?.message?.content ?? data.content ?? "";

      if (!enhancedContent || enhancedContent.trim().length < 10) {
        throw new Error("Empty or too short response from API");
      }

      console.log(`[PersonalityEnhancer] Successfully enhanced personality for ${subagentName}`);

      return {
        base: subagentDescription,
        enhanced: enhancedContent,
        enhancedBy: mainAgentEndpoint.model,
        enhancedAt: new Date().toISOString(),
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof Error && error.name === "AbortError") {
        console.error(`[PersonalityEnhancer] Request timed out after ${timeoutMs}ms`);
        lastError = new Error(`Request timed out after ${timeoutMs}ms`);
      } else {
        console.error(`[PersonalityEnhancer] Attempt ${attempt + 1} failed:`, lastError.message);
      }
    }
  }

  console.error(`[PersonalityEnhancer] All ${MAX_RETRIES + 1} attempts failed for ${subagentName}:`, lastError?.message);
  return {
    base: subagentDescription,
    enhanced: undefined,
    enhancedBy: undefined,
    enhancedAt: undefined,
  };
}

export async function enhanceSubagentConfig(
  config: SubagentConfig,
  mainAgentEndpoint?: {
    baseUrl: string;
    model: string;
    apiKey?: string;
  }
): Promise<SubagentConfig> {
  const enhancedPersonality = await enhanceSubagentPersonality({
    subagentName: config.name,
    subagentDescription: config.description,
    mainAgentEndpoint,
  });

  return {
    ...config,
    personality: enhancedPersonality,
  };
}

export function canEnhancePersonality(mainAgentEndpoint?: {
  baseUrl: string;
  model: string;
  apiKey?: string;
}): boolean {
  return !!mainAgentEndpoint?.baseUrl && !!mainAgentEndpoint?.model;
}
