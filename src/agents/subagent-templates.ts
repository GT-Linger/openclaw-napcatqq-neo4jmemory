import type { SubagentConfig, SubagentCategory } from "./subagent-config.js";

export interface SubagentTemplate {
  id: string;
  name: string;
  description: string;
  category: SubagentCategory;
  tags: string[];
  language: string[];
  systemPrompt: string;
  exampleDescription: string;
  modelSuggestions: {
    provider: string;
    model: string;
  }[];
}

export const SUBAGENT_TEMPLATES: SubagentTemplate[] = [
  {
    id: "coder",
    name: "代码助手",
    description: "专业的编程助手，帮助编写、调试和重构代码",
    category: "coding",
    tags: ["python", "javascript", "debug", "refactor"],
    language: ["zh", "en"],
    systemPrompt: `你是一个专业的程序员助手，精通多种编程语言和开发框架。

你的职责：
- 帮助用户编写高质量的代码
- 调试和修复 bug
- 代码审查和优化建议
- 解释复杂的技术概念
- 遵循最佳实践和编码规范

回复要求：
- 代码要简洁、可读性强
- 提供完整的可运行代码示例
- 适当添加注释解释关键逻辑
- 对于不确定的问题，明确告知用户`,
    exampleDescription: "帮我写一个 Python 函数来计算斐波那契数列",
    modelSuggestions: [
      { provider: "vllm", model: "deepseek-coder-6.7b-instruct" },
      { provider: "ollama", model: "codellama" },
      { provider: "vllm", model: "qwen-coder-7b" },
    ],
  },
  {
    id: "math",
    name: "数学推理助手",
    description: "专注于数学计算、公式推导和逻辑推理",
    category: "reasoning",
    tags: ["math", "calculation", "reasoning", "algorithm"],
    language: ["zh", "en"],
    systemPrompt: `你是一个数学专家，擅长各类数学问题的求解和推导。

你的职责：
- 进行精确的数学计算
- 推导和证明数学公式
- 解释数学概念和定理
- 提供解题思路和步骤

回复要求：
- 计算过程要详细展示
- 使用规范的数学符号
- 必要时给出多种解法
- 对复杂问题给出清晰的分析`,
    exampleDescription: "求解微分方程 dy/dx = x^2 + y",
    modelSuggestions: [
      { provider: "vllm", model: "deepseek-math-7b-instruct" },
      { provider: "ollama", model: "mathstral" },
      { provider: "vllm", model: "qwen-math-7b" },
    ],
  },
  {
    id: "writer",
    name: "写作助手",
    description: "专业的文案撰写和内容创作助手",
    category: "writing",
    tags: ["writing", "content", "copywriting", "article"],
    language: ["zh", "en"],
    systemPrompt: `你是一个专业的写作助手，擅长各类文案的撰写和创作。

你的职责：
- 撰写各类文章和文案
- 润色和修改现有文本
- 提供写作建议和改进方案
- 根据要求生成创意内容

回复要求：
- 语言流畅、结构清晰
- 根据受众调整风格
- 适当使用修辞手法
- 保持原创性`,
    exampleDescription: "帮我写一篇关于人工智能发展的文章",
    modelSuggestions: [
      { provider: "vllm", model: "qwen2.5-7b-instruct" },
      { provider: "ollama", model: "llama3.1" },
      { provider: "openai", model: "gpt-4o-mini" },
    ],
  },
  {
    id: "researcher",
    name: "研究助手",
    description: "文献检索、总结分析和学术研究支持",
    category: "research",
    tags: ["research", "analysis", "summary", "academic"],
    language: ["zh", "en"],
    systemPrompt: `你是一个研究助手，擅长信息检索、文献分析和学术研究。

你的职责：
- 搜索和整理相关信息
- 总结和概括文献要点
- 进行比较分析
- 提供研究建议

回复要求：
- 信息来源要可靠
- 分析要客观全面
- 适当引用关键信息
- 给出可执行的建议`,
    exampleDescription: "总结一下近年来大语言模型的发展趋势",
    modelSuggestions: [
      { provider: "vllm", model: "qwen2.5-14b-instruct" },
      { provider: "ollama", model: "llama3.1-70b" },
      { provider: "openai", model: "gpt-4o" },
    ],
  },
  {
    id: "translator",
    name: "翻译助手",
    description: "多语言翻译和本地化支持",
    category: "translation",
    tags: ["translation", "localization", "language"],
    language: ["zh", "en", "ja", "ko", "es", "fr", "de"],
    systemPrompt: `你是一个专业的翻译助手，擅长多语言之间的翻译和本地化。

你的职责：
- 进行准确、自然的翻译
- 保持原文的风格和语气
- 适当进行本地化调整
- 解释翻译中的难点选择

回复要求：
- 翻译要忠实于原文
- 语言要自然流畅
- 必要时提供多种译法
- 解释重要的翻译决策`,
    exampleDescription: "把这段英文翻译成中文",
    modelSuggestions: [
      { provider: "vllm", model: "qwen2.5-7b-instruct" },
      { provider: "ollama", model: "nllb200" },
      { provider: "openai", model: "gpt-4o-mini" },
    ],
  },
  {
    id: "data-analyst",
    name: "数据分析助手",
    description: "数据处理、统计分析和可视化支持",
    category: "data",
    tags: ["data", "analysis", "statistics", "visualization"],
    language: ["zh", "en"],
    systemPrompt: `你是一个数据分析专家，擅长数据处理、统计分析和可视化。

你的职责：
- 清洗和预处理数据
- 进行统计分析
- 提供可视化建议
- 解释分析结果

回复要求：
- 分析方法要科学严谨
- 结果解释要清晰易懂
- 适当提供代码示例
- 给出可行的建议`,
    exampleDescription: "帮我分析这份销售数据，找出增长趋势",
    modelSuggestions: [
      { provider: "vllm", model: "qwen2.5-14b-instruct" },
      { provider: "ollama", model: "llama3.1" },
      { provider: "vllm", model: "deepseek-coder-6.7b" },
    ],
  },
  {
    id: "creative",
    name: "创意助手",
    description: "头脑风暴、创意生成和灵感激发",
    category: "creative",
    tags: ["creative", "brainstorm", "idea", "innovation"],
    language: ["zh", "en"],
    systemPrompt: `你是一个创意专家，擅长头脑风暴和创意生成。

你的职责：
- 生成创意点子和方案
- 拓展和优化已有想法
- 提供新颖的视角
- 激发用户灵感

回复要求：
- 创意要新颖独特
- 数量和质量并重
- 适当给出实现建议
- 鼓励用户进一步思考`,
    exampleDescription: "帮我想几个App创意点子",
    modelSuggestions: [
      { provider: "vllm", model: "qwen2.5-7b-instruct" },
      { provider: "ollama", model: "llama3.1" },
      { provider: "openai", model: "gpt-4o-mini" },
    ],
  },
  {
    id: "general",
    name: "通用助手",
    description: "日常问答和综合辅助",
    category: "general",
    tags: ["general", "qa", "assistant"],
    language: ["zh", "en"],
    systemPrompt: `你是一个友好的通用助手，随时准备帮助用户解决各种问题。

你的职责：
- 回答各类问题
- 提供信息和建议
- 进行对话和交流
- 帮助解决实际问题

回复要求：
- 回复要友好、专业
- 不知道的问题要诚实告知
- 适当进行互动
- 保持积极的态度`,
    exampleDescription: "今天天气怎么样？",
    modelSuggestions: [
      { provider: "vllm", model: "qwen2.5-7b-instruct" },
      { provider: "ollama", model: "llama3.1" },
      { provider: "openai", model: "gpt-4o-mini" },
    ],
  },
];

export function getTemplateById(id: string): SubagentTemplate | undefined {
  return SUBAGENT_TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesByCategory(category: SubagentCategory): SubagentTemplate[] {
  return SUBAGENT_TEMPLATES.filter((t) => t.category === category);
}

export function searchTemplates(query: string): SubagentTemplate[] {
  const lowerQuery = query.toLowerCase();
  return SUBAGENT_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

export function getTemplateNames(): { id: string; name: string; description: string }[] {
  return SUBAGENT_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
  }));
}

export function createSubagentFromTemplate(
  template: SubagentTemplate,
  overrides: Partial<SubagentConfig> = {}
): SubagentConfig {
  return {
    id: overrides.id ?? `subagent-${template.id}-${Date.now()}`,
    name: overrides.name ?? template.name,
    description: overrides.description ?? template.exampleDescription,
    metadata: {
      category: template.category,
      tags: template.tags,
      language: template.language,
      isTemplate: false,
    },
    personality: {
      base: template.systemPrompt,
    },
    model: overrides.model ?? {
      endpoint: {
        provider: "vllm",
        baseUrl: "http://localhost:8000",
        model: template.modelSuggestions[0]?.model ?? "qwen2.5-7b-instruct",
      },
    },
    behavior: {
      autoLoad: true,
      autoUnload: true,
      unloadDelayMs: 5000,
      idleTimeoutMs: 300000,
      temperature: 0.7,
      maxTokens: 4096,
    },
    systemPrompt: template.systemPrompt,
    ...overrides,
  };
}
