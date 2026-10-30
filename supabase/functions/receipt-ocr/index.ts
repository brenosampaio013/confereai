// Supabase Edge Function: receipt-ocr
//
// Recebe de 1 a 6 fotos (JPEG em base64) de um cupom fiscal ou etiqueta e devolve SOMENTE
// a transcrição do texto, linha a linha. A interpretação (itens, valores, totais) é feita
// no aplicativo por regras determinísticas, para que nenhum valor seja inventado pela IA.
//
// - Exige usuário autenticado no Supabase (pode ser sessão anônima).
// - As imagens são processadas em memória e não são armazenadas.
// - Chaves de API ficam apenas nos segredos da função (nunca no aplicativo).
//
// Segredos (supabase secrets set ...):
//   OCR_PROVIDER         "anthropic" (padrão) ou "google_vision"
//   ANTHROPIC_API_KEY    obrigatório se OCR_PROVIDER=anthropic
//   ANTHROPIC_MODEL      opcional (padrão: claude-opus-5-5)
//   GOOGLE_VISION_API_KEY obrigatório se OCR_PROVIDER=google_vision
//   OCR_DAILY_LIMIT      opcional (padrão: 60 requisições por usuário por dia)

import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

type Kind = 'receipt' | 'label';
interface ImageInput {
  base64: string;
  mimeType?: 'image/jpeg' | 'image/png';
}
interface OcrResponse {
  provider: string;
  parts: { lines: string[] }[];
}

const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 4_500_000; // ~4,5 MB por imagem (o app envia ~1600 px, JPEG 0,7)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const TRANSCRIBE_PROMPT: Record<Kind, string> = {
  receipt: `As imagens são partes, em ordem, de UM cupom fiscal brasileiro (NFC-e, SAT ou ECF).
Transcreva o texto impresso de cada imagem exatamente como aparece, uma linha impressa por item da lista "lines".
Regras:
- Preserve números, vírgulas, pontos, códigos, unidades (UN, KG...) e sinais exatamente como impressos.
- Mantenha na mesma linha o que está na mesma linha impressa (por exemplo: código, descrição, quantidade, preço unitário e total).
- Não corrija, não complete, não some, não traduza e não interprete valores.
- Se um trecho estiver ilegível, escreva [ilegível] no lugar dele. Nunca adivinhe dígitos.
- Ignore QR Codes e códigos de barras desenhados.
- Retorne uma entrada em "parts" para cada imagem, na mesma ordem das imagens.`,
  label: `A imagem é uma etiqueta de preço de gôndola de supermercado brasileiro.
Transcreva o texto impresso exatamente como aparece, uma linha por item da lista "lines".
Preserve valores, "R$", "/KG", "POR", "DE", condições de promoção e datas exatamente como impressos.
Se algo estiver ilegível, escreva [ilegível]. Não adivinhe e não interprete.
Retorne uma entrada em "parts" para cada imagem.`,
};

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['parts'],
  properties: {
    parts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['lines'],
        properties: { lines: { type: 'array', items: { type: 'string' } } },
      },
    },
  },
} as const;

async function transcribeWithClaude(kind: Kind, images: ImageInput[]): Promise<OcrResponse> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) throw new HttpError(503, 'ocr_not_configured', 'ANTHROPIC_API_KEY não configurada na função.');
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-opus-5-5';
  const client = new Anthropic({ apiKey });

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  images.forEach((img, i) => {
    content.push({ type: 'text', text: `Imagem ${i + 1} de ${images.length}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: img.mimeType ?? 'image/jpeg', data: img.base64 } });
  });
  content.push({ type: 'text', text: TRANSCRIBE_PROMPT[kind] });

  const response = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    // Transcrição literal: esforço baixo é suficiente e reduz custo/latência.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    // Se um classificador de segurança recusar, o próprio servidor tenta o modelo de fallback recomendado.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content }],
  });

  if (response.stop_reason === 'refusal') {
    throw new HttpError(422, 'ocr_refused', 'O serviço de OCR recusou processar a imagem.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new HttpError(422, 'ocr_truncated', 'O cupom é longo demais para uma única leitura. Envie menos fotos por vez.');
  }
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new HttpError(502, 'ocr_empty', 'O serviço de OCR não retornou texto.');
  let parsed: { parts: { lines: string[] }[] };
  try {
    parsed = JSON.parse(text.text);
  } catch {
    throw new HttpError(502, 'ocr_invalid', 'Resposta do OCR em formato inesperado.');
  }
  return { provider: `anthropic:${response.model}`, parts: normalizeParts(parsed.parts, images.length) };
}

async function transcribeWithGoogleVision(images: ImageInput[]): Promise<OcrResponse> {
  const key = Deno.env.get('GOOGLE_VISION_API_KEY');
  if (!key) throw new HttpError(503, 'ocr_not_configured', 'GOOGLE_VISION_API_KEY não configurada na função.');
  const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: images.map((img) => ({
        image: { content: img.base64 },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        imageContext: { languageHints: ['pt'] },
      })),
    }),
  });
  if (!res.ok) throw new HttpError(502, 'ocr_upstream', `Google Vision respondeu ${res.status}.`);
  const data = await res.json();
  const parts = (data.responses ?? []).map((r: { fullTextAnnotation?: { text?: string }; error?: { message: string } }) => {
    if (r.error) throw new HttpError(502, 'ocr_upstream', r.error.message);
    return { lines: (r.fullTextAnnotation?.text ?? '').split('\n') };
  });
  return { provider: 'google_vision', parts: normalizeParts(parts, images.length) };
}

function normalizeParts(parts: { lines: string[] }[] | undefined, expected: number) {
  const out = (parts ?? []).slice(0, expected).map((p) => ({
    lines: (p?.lines ?? []).map((l) => String(l).replace(/\s+$/g, '')).filter((l) => l.trim().length > 0).slice(0, 400),
  }));
  while (out.length < expected) out.push({ lines: [] });
  return out;
}

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new HttpError(401, 'unauthenticated', 'Sessão necessária.');
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) throw new HttpError(401, 'unauthenticated', 'Sessão inválida.');

    const body = (await req.json().catch(() => null)) as { kind?: Kind; images?: ImageInput[] } | null;
    const kind: Kind = body?.kind === 'label' ? 'label' : 'receipt';
    const images = body?.images ?? [];
    if (!Array.isArray(images) || images.length < 1 || images.length > MAX_IMAGES) {
      throw new HttpError(400, 'invalid_images', `Envie de 1 a ${MAX_IMAGES} imagens.`);
    }
    for (const img of images) {
      if (typeof img?.base64 !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(img.base64.slice(0, 200))) {
        throw new HttpError(400, 'invalid_images', 'Imagem em formato inválido.');
      }
      if ((img.base64.length * 3) / 4 > MAX_IMAGE_BYTES) throw new HttpError(413, 'image_too_large', 'Imagem muito grande.');
      if (img.mimeType && img.mimeType !== 'image/jpeg' && img.mimeType !== 'image/png') {
        throw new HttpError(400, 'invalid_images', 'Use JPEG ou PNG.');
      }
    }

    // Limite diário por usuário (protege contra abuso e custo inesperado).
    const limit = Number(Deno.env.get('OCR_DAILY_LIMIT') ?? '60');
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await supabase.from('ocr_usage').select('id', { count: 'exact', head: true }).gte('created_at', since);
    if ((count ?? 0) >= limit) throw new HttpError(429, 'daily_limit', 'Limite diário de leituras atingido. Tente amanhã ou digite os dados.');

    const provider = (Deno.env.get('OCR_PROVIDER') ?? 'anthropic').toLowerCase();
    const result = provider === 'google_vision' ? await transcribeWithGoogleVision(images) : await transcribeWithClaude(kind, images);

    await supabase.from('ocr_usage').insert({ kind, images: images.length, provider: result.provider });
    return json(200, result);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.code, message: e.message });
    if (e instanceof Anthropic.APIError) {
      console.error('anthropic_error', e.status);
      return json(502, { error: 'ocr_upstream', message: 'Falha no serviço de OCR. Tente novamente.' });
    }
    console.error('unexpected_error', e instanceof Error ? e.message : String(e));
    return json(500, { error: 'internal', message: 'Erro inesperado ao processar a imagem.' });
  }
});
