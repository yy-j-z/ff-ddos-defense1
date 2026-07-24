/**
 * LLM Client —— 兼容 OpenAI 协议的 DeepSeek 接入
 *
 * 模型选择策略:
 *   - Judge: deepseek-v4-pro  (启用 thinking,reasoning_effort=high)
 *   - Analyzer / Attacker / Verifier: deepseek-v4-flash  (更快更便宜)
 */
import OpenAI from 'openai';
import { z, ZodSchema } from 'zod';
import { jsonrepair } from 'jsonrepair';

export const MODEL_PRO = 'deepseek-v4-pro';
export const MODEL_FLASH = 'deepseek-v4-flash';

export type ModelTier = 'pro' | 'flash';

export const llm = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
  baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'
});

export function pickModel(tier: ModelTier): string {
  return tier === 'pro' ? MODEL_PRO : MODEL_FLASH;
}

interface GenerateObjectOptions<T> {
  tier?: ModelTier;
  system: string;
  prompt: string;
  schema: ZodSchema<T>;
  schemaName?: string;
  temperature?: number;
  enableThinking?: boolean;
  maxTokens?: number;
}

/**
 * 让 LLM 输出严格符合 Zod schema 的对象。
 * 通过 response_format=json_object + schema 描述注入 prompt 实现。
 */
export async function generateObject<T>(opts: GenerateObjectOptions<T>): Promise<{
  object: T;
  thinking?: string;
  raw: string;
}> {
  const model = pickModel(opts.tier ?? 'flash');
  const schemaHint = `\n\n请严格以下面 JSON Schema 输出,不要任何额外文本,不要 markdown 围栏:\n${JSON.stringify(
    zodToSimpleSchema(opts.schema),
    null,
    2
  )}`;

  const completion = await llm.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: opts.system + schemaHint },
      { role: 'user', content: opts.prompt }
    ],
    temperature: opts.temperature ?? 0.6,
    max_tokens: opts.maxTokens ?? 4096,
    response_format: { type: 'json_object' },
    ...(opts.enableThinking
      ? ({ thinking: { type: 'enabled' }, reasoning_effort: 'high' } as Record<string, unknown>)
      : {})
  } as OpenAI.Chat.Completions.CompletionCreateParamsNonStreaming);

  const raw = completion.choices[0]?.message?.content ?? '';
  const thinking = (completion.choices[0]?.message as { reasoning_content?: string } | undefined)
    ?.reasoning_content;

  const parsed = parseLenientJson(raw);
  const validated = opts.schema.parse(parsed);
  return { object: validated, thinking, raw };
}

/** 流式生成纯文本(供 SSE thinking 推送) */
export async function* streamText(opts: {
  tier?: ModelTier;
  system: string;
  prompt: string;
  temperature?: number;
}): AsyncIterable<string> {
  const stream = await llm.chat.completions.create({
    model: pickModel(opts.tier ?? 'flash'),
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.prompt }
    ],
    temperature: opts.temperature ?? 0.7,
    stream: true
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

/**
 * 宽容解析 LLM 返回的 JSON:
 *  1. 剥掉 ```json ... ``` markdown 围栏
 *  2. 截取首个 { 到末个 } 之间的内容(去掉前后多余说明文字)
 *  3. 直接 JSON.parse;失败则用 jsonrepair 修复(尾逗号/单引号/截断等)再 parse
 */
function parseLenientJson(raw: string): unknown {
  let text = raw.trim();

  // 去 markdown 围栏
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  // 截取最外层对象/数组
  const firstObj = text.indexOf('{');
  const firstArr = text.indexOf('[');
  const start =
    firstObj === -1 ? firstArr : firstArr === -1 ? firstObj : Math.min(firstObj, firstArr);
  if (start > 0) {
    const lastObj = text.lastIndexOf('}');
    const lastArr = text.lastIndexOf(']');
    const end = Math.max(lastObj, lastArr);
    if (end > start) text = text.slice(start, end + 1);
  }

  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(jsonrepair(text));
    } catch (err) {
      throw new Error(`LLM 返回无法修复的 JSON: ${raw.slice(0, 200)}`);
    }
  }
}

/** 极简 Zod → JSON Schema 描述(够给 LLM 看,不追求标准) */
function zodToSimpleSchema(schema: ZodSchema): unknown {
  const def = (schema as unknown as { _def: { typeName: string } })._def;
  switch (def.typeName) {
    case 'ZodObject': {
      const shape = (schema as unknown as z.ZodObject<z.ZodRawShape>).shape;
      const props: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(shape)) {
        props[k] = zodToSimpleSchema(v as ZodSchema);
        if (!(v as z.ZodTypeAny).isOptional()) required.push(k);
      }
      return { type: 'object', properties: props, required };
    }
    case 'ZodArray':
      return { type: 'array', items: zodToSimpleSchema((def as unknown as { type: ZodSchema }).type) };
    case 'ZodString':
      return { type: 'string' };
    case 'ZodNumber':
      return { type: 'number' };
    case 'ZodBoolean':
      return { type: 'boolean' };
    case 'ZodEnum':
      return { type: 'string', enum: (def as unknown as { values: string[] }).values };
    case 'ZodOptional':
    case 'ZodNullable':
      return zodToSimpleSchema((def as unknown as { innerType: ZodSchema }).innerType);
    case 'ZodDefault':
      return zodToSimpleSchema((def as unknown as { innerType: ZodSchema }).innerType);
    case 'ZodEffects':
      return zodToSimpleSchema((def as unknown as { schema: ZodSchema }).schema);
    case 'ZodRecord':
      return { type: 'object', additionalProperties: true };
    default:
      return {};
  }
}
