// OpenRouter, the one door to the models. The key and the models are the
// server's settings; the fetch can be swapped for a recorded one in tests.
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export type Settings = {
  key: string;
  research: string;
  writer: string;
  budgetUsd: number;
};

export const settingsFromEnv = (env = process.env): Settings => ({
  key: env.OPENROUTER_API_KEY ?? '',
  research: env.ACADEMY_RESEARCH_MODEL || 'google/gemini-3.8-flash',
  writer: env.ACADEMY_WRITER_MODEL || 'anthropic/claude-sonnet-5',
  budgetUsd: Number(env.ACADEMY_BUDGET_USD || 10),
});

export type Reply = { text: string; costUsd: number; sources: { title: string; url: string }[] };
type Message = { role: 'system' | 'user' | 'assistant'; content: string };

export class OpenRouterError extends Error {}

// Structured output takes only the shape of a schema, not its limits (lengths,
// counts); those are left to the zod check on the reply.
const LIMITS = new Set(['$schema', 'minLength', 'maxLength', 'maxItems', 'minimum', 'maximum', 'pattern']);
export function shapeOf(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(shapeOf);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(Object.entries(schema)
    .filter(([k]) => !LIMITS.has(k))
    .map(([k, v]) => [k, k === 'minItems' ? Math.min(Number(v), 1) : k === 'properties' ? Object.fromEntries(Object.entries(v as object).map(([p, x]) => [p, shapeOf(x)])) : shapeOf(v)]));
}

// PDFs go along with the last message, read by the model itself.
export type Pdf = { name: string; base64: string };
export async function complete(fetch: Fetch, settings: Settings, body: {
  model: string; messages: Message[]; web?: boolean; schema?: { name: string; schema: unknown }; maxTokens?: number; pdfs?: Pdf[];
}): Promise<Reply> {
  if (!settings.key) throw new OpenRouterError('no OpenRouter key is set on the server (OPENROUTER_API_KEY)');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://aura.amygdala-inc.org',
      'X-Title': 'AURA-1 Academy',
    },
    body: JSON.stringify({
      model: body.model,
      messages: body.pdfs?.length
        ? body.messages.map((m, i) => (i === body.messages.length - 1
          ? { ...m, content: [{ type: 'text', text: m.content }, ...body.pdfs!.map((f) => ({ type: 'file', file: { filename: f.name, file_data: `data:application/pdf;base64,${f.base64}` } }))] }
          : m))
        : body.messages,
      max_tokens: body.maxTokens ?? 8000,
      usage: { include: true },
      ...(body.web ? { plugins: [{ id: 'web', max_results: 6 }] } : body.pdfs?.length ? { plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }] } : {}),
      ...(body.schema ? { response_format: { type: 'json_schema', json_schema: { name: body.schema.name, strict: true, schema: shapeOf(body.schema.schema) } } } : {}),
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const json = await res.json().catch(() => null) as null | {
    error?: { message?: string };
    choices?: { message?: { content?: string; annotations?: { type: string; url_citation?: { url: string; title?: string } }[] } }[];
    usage?: { cost?: number };
  };
  if (!res.ok || !json?.choices?.[0]) throw new OpenRouterError(json?.error?.message ?? `OpenRouter answered ${res.status}`);
  const message = json.choices[0].message ?? {};
  const seen = new Set<string>();
  const sources = (message.annotations ?? [])
    .filter((a) => a.type === 'url_citation' && a.url_citation?.url)
    .map((a) => ({ url: a.url_citation!.url, title: a.url_citation!.title || a.url_citation!.url }))
    .filter((s) => !seen.has(s.url) && seen.add(s.url));
  return { text: message.content ?? '', costUsd: json.usage?.cost ?? 0, sources };
}
