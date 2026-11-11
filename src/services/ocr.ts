/**
 * Cliente do serviço de OCR (Edge Function `receipt-ocr`).
 * O aplicativo nunca conhece chaves de IA/OCR: ele envia as imagens para a função do
 * Supabase do próprio projeto, que chama o provedor configurado e devolve apenas o texto.
 */
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { parseLabel } from '@/domain/labelParser';
import { type CaptureReading, normalizeProductCapture, type RawProductCapture } from '@/domain/productCapture';
import { getSupabase } from './supabase';
import { isOnline } from './network';

export type OcrErrorReason =
  | 'not_configured'
  | 'offline'
  | 'needs_account'
  | 'daily_limit'
  | 'too_large'
  | 'service_error';

export class OcrError extends Error {
  constructor(public reason: OcrErrorReason, message: string) {
    super(message);
  }
}

export interface OcrResult {
  provider: string;
  parts: { lines: string[] }[];
  /** Campos identificados na foto do produto com a etiqueta (kind = 'product'). */
  product?: RawProductCapture;
}

/** Reduz e comprime a foto antes do envio (menos dados móveis, sem perder legibilidade). */
export async function prepareImage(uri: string): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: 1600 });
  const ref = await ctx.renderAsync();
  const saved = await ref.saveAsync({ compress: 0.72, format: SaveFormat.JPEG, base64: true });
  if (!saved.base64) throw new OcrError('service_error', 'Não foi possível preparar a imagem.');
  return saved.base64;
}

export async function ensureSession(): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new OcrError('not_configured', 'O serviço de leitura automática não está configurado neste aplicativo.');
  const { data } = await sb.auth.getSession();
  if (data.session) return;
  // Sessão anônima: permite usar o OCR sem criar conta (precisa estar habilitada no Supabase).
  const { error } = await sb.auth.signInAnonymously();
  if (error) {
    throw new OcrError('needs_account', 'Para usar a leitura automática, entre na sua conta (o acesso anônimo não está habilitado).');
  }
}

export async function runOcr(kind: 'receipt' | 'label' | 'product', imageUris: string[]): Promise<OcrResult> {
  const sb = getSupabase();
  if (!sb) throw new OcrError('not_configured', 'O serviço de leitura automática não está configurado neste aplicativo.');
  if (!(await isOnline())) {
    throw new OcrError('offline', 'Sem conexão com a internet. A leitura automática precisa de internet; você pode digitar os dados manualmente.');
  }
  await ensureSession();
  const images = [];
  for (const uri of imageUris) images.push({ base64: await prepareImage(uri), mimeType: 'image/jpeg' as const });

  const { data, error } = await sb.functions.invoke<OcrResult>('receipt-ocr', { body: { kind, images } });
  if (error) {
    let status = 0;
    let message = 'O serviço de leitura falhou. Tente novamente ou digite os dados.';
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.status === 'number') {
      status = ctx.status;
      try {
        const body = await ctx.json();
        if (body?.message) message = body.message;
      } catch {
        // corpo não-JSON
      }
    }
    if (status === 429) throw new OcrError('daily_limit', message);
    if (status === 413) throw new OcrError('too_large', message);
    if (status === 503) throw new OcrError('not_configured', message);
    if (status === 401) throw new OcrError('needs_account', 'Sua sessão expirou. Entre novamente na conta.');
    throw new OcrError('service_error', message);
  }
  if (!data || !Array.isArray(data.parts)) throw new OcrError('service_error', 'Resposta inesperada do serviço de leitura.');
  return data;
}

/**
 * Lê a foto do produto com a etiqueta de preço. O resultado é sempre uma sugestão para
 * o usuário conferir. Se o provedor só transcreve texto (Google Vision), a etiqueta é
 * interpretada pelas regras do aplicativo e o nome/marca ficam para o usuário completar.
 */
export async function readProductPhoto(uri: string): Promise<{ reading: CaptureReading; lines: string[]; provider: string }> {
  const res = await runOcr('product', [uri]);
  const lines = res.parts[0]?.lines ?? [];
  if (res.product) return { reading: normalizeProductCapture(res.product), lines, provider: res.provider };
  const label = parseLabel(lines);
  return {
    reading: {
      ...label,
      association: 'uncertain',
      uncertain: [],
      notes: [...label.notes, 'A leitura trouxe apenas o texto da etiqueta. Confira o nome, a marca e o peso do produto.'],
    },
    lines,
    provider: res.provider,
  };
}
