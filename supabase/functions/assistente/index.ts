// Supabase Edge Function: assistente
//
// Recebe um trecho de áudio (o que a pessoa falou), devolve a transcrição e uma LISTA DE
// SUGESTÕES de itens para o carrinho. O aplicativo mostra as sugestões e só coloca no carrinho
// o que a pessoa confirmar — a IA sugere, nunca decide. Isso não é cerimônia: ela erra marca,
// peso e quantidade, e o carrinho é justamente o que depois se compara com o cupom fiscal.
//
// São dois passos, porque nenhum fornecedor faz os dois bem com uma chave só:
//   1. transcrever o áudio  — OpenAI (aceita .m4a do celular e .webm do navegador)
//   2. entender o pedido    — Claude, a mesma que já lê cupons e etiquetas neste projeto
//
// - Exige conta (não serve sessão anônima) e consome a cota mensal de voz do plano.
// - O áudio é processado em memória e NÃO é armazenado, nem por nós nem para treino.
// - As chaves ficam apenas nos segredos da função.
//
// Segredos (supabase secrets set ...):
//   OPENAI_API_KEY     obrigatória — transcrição
//   OPENAI_STT_MODEL   opcional (padrão: gpt-4o-mini-transcribe)
//   ANTHROPIC_API_KEY  obrigatória — entendimento
//   ANTHROPIC_MODEL    opcional (padrão: claude-opus-5-5)
import Anthropic from 'npm:@anthropic-ai/sdk@1.3.0';
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

/** ~45 s de fala em AAC/Opus. Mais que isso é conversa, não pedido de compra. */
const MAX_AUDIO_BYTES = 1_500_000;
const TIPOS = ['audio/m4a', 'audio/mp4', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav'] as const;
type TipoAudio = (typeof TIPOS)[number];
const EXTENSAO: Record<TipoAudio, string> = {
  'audio/m4a': 'm4a',
  'audio/mp4': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

interface ItemSugerido {
  nome: string;
  marca?: string | null;
  quantidade?: number | null;
  unidade?: string | null;
  observacao?: string | null;
}

const INSTRUCOES = `Você ajuda alguém a montar a lista de compras de supermercado no aplicativo Meu Carrin, no Brasil.
Recebe o que a pessoa falou, já transcrito. Devolve os produtos que ela pediu.

Regras:
- Copie o que foi dito. Não acrescente produtos que a pessoa não pediu, nem sugira marcas que ela não disse.
- Quantidade: quando ela disser ("dois quilos de arroz"), separe o número da unidade. Quando não disser, deixe em branco — não invente 1.
- Unidade: use kg, g, L, ml ou un. "Dois pacotes" é quantidade 2 e unidade un; o peso do pacote vai em observacao se tiver sido dito.
- Marca só quando falada ("arroz tio joão" → nome "Arroz", marca "Tio João").
- Nunca invente preço. Preço não é assunto seu.
- Se a fala não tiver nada de compra (ou estiver incompreensível), devolva a lista vazia e diga isso na resposta.
- resposta: uma frase curta, em português do Brasil, falando com a pessoa, confirmando o que entendeu. Sem emojis. Ela será lida em voz alta.`;

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['resposta', 'itens'],
  properties: {
    resposta: { type: 'string' },
    itens: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nome'],
        properties: {
          nome: { type: 'string' },
          marca: { type: ['string', 'null'] },
          quantidade: { type: ['number', 'null'] },
          unidade: { type: ['string', 'null'], enum: ['kg', 'g', 'L', 'ml', 'un', null] },
          observacao: { type: ['string', 'null'] },
        },
      },
    },
  },
} as const;

async function transcrever(audio: Uint8Array, tipo: TipoAudio): Promise<string> {
  const chave = Deno.env.get('OPENAI_API_KEY');
  if (!chave) throw new HttpError(503, 'nao_configurado', 'O assistente de voz ainda não está configurado.');
  const corpo = new FormData();
  corpo.append('file', new Blob([audio.buffer as ArrayBuffer], { type: tipo }), `fala.${EXTENSAO[tipo]}`);
  corpo.append('model', Deno.env.get('OPENAI_STT_MODEL') ?? 'gpt-4o-mini-transcribe');
  corpo.append('language', 'pt');
  // Ajuda a transcrever nomes de produto e marcas brasileiras.
  corpo.append('prompt', 'Lista de compras de supermercado no Brasil, com marcas, pesos e quantidades.');

  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${chave}` },
    body: corpo,
  });
  if (!r.ok) {
    const detalhe = await r.text();
    console.error('transcricao_falhou', r.status, detalhe.slice(0, 200));
    if (r.status === 429) throw new HttpError(503, 'servico_ocupado', 'O serviço de transcrição está indisponível agora. Tente de novo em instantes.');
    throw new HttpError(502, 'transcricao_falhou', 'Não consegui entender o áudio. Tente falar de novo.');
  }
  const d = (await r.json()) as { text?: string };
  return (d.text ?? '').trim();
}

async function entender(fala: string): Promise<{ resposta: string; itens: ItemSugerido[] }> {
  const chave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!chave) throw new HttpError(503, 'nao_configurado', 'O assistente de voz ainda não está configurado.');
  const anthropic = new Anthropic({ apiKey: chave });

  // Mesmo formato do leitor de cupons: saída estruturada, esforço baixo (a tarefa é curta) e
  // modelo reserva quando o principal recusa — recusa aqui seria a pessoa sem resposta nenhuma.
  const r = await anthropic.beta.messages.create({
    model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-opus-5-5',
    max_tokens: 2000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: INSTRUCOES,
    messages: [{ role: 'user', content: `A pessoa falou: "${fala}"` }],
  });
  if (r.stop_reason === 'refusal') throw new HttpError(422, 'recusado', 'Não consegui atender esse pedido. Tente dizer só os produtos.');
  if (r.stop_reason === 'max_tokens') throw new HttpError(422, 'longo_demais', 'Foi pedido demais de uma vez. Fale em partes menores.');

  const bloco = r.content.find((b) => b.type === 'text');
  if (!bloco || bloco.type !== 'text') throw new HttpError(502, 'resposta_vazia', 'Não recebi resposta do serviço. Tente de novo.');
  let lido: { resposta?: string; itens?: ItemSugerido[] };
  try {
    lido = JSON.parse(bloco.text);
  } catch {
    console.error('resposta_nao_json');
    throw new HttpError(502, 'resposta_invalida', 'Não consegui montar a lista. Tente falar de novo.');
  }
  return {
    resposta: typeof lido.resposta === 'string' ? lido.resposta : '',
    itens: Array.isArray(lido.itens) ? lido.itens.slice(0, 30) : [],
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization) throw new HttpError(401, 'unauthenticated', 'Entre na sua conta para falar com o assistente.');
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: quem, error: erroUsuario } = await supabase.auth.getUser();
    if (erroUsuario || !quem.user) throw new HttpError(401, 'unauthenticated', 'Sessão inválida. Entre de novo.');
    if (quem.user.is_anonymous) throw new HttpError(401, 'needs_account', 'O assistente precisa de uma conta.');

    const corpo = (await req.json().catch(() => null)) as { audio?: string; mimeType?: string } | null;
    const tipo = (corpo?.mimeType ?? 'audio/m4a') as TipoAudio;
    if (!TIPOS.includes(tipo)) throw new HttpError(400, 'formato_invalido', 'Formato de áudio não suportado.');
    if (typeof corpo?.audio !== 'string' || corpo.audio.length < 100) {
      throw new HttpError(400, 'audio_invalido', 'Não recebi o áudio. Tente gravar de novo.');
    }
    if ((corpo.audio.length * 3) / 4 > MAX_AUDIO_BYTES) {
      throw new HttpError(413, 'audio_longo', 'A gravação ficou longa demais. Fale o pedido em até 45 segundos.');
    }

    // Cota do plano. O balde 'voz' é zero nos planos que não incluem o assistente, então a
    // própria cota é a trava: não existe regra separada dizendo "quem pode".
    const { data: cota, error: erroCota } = await supabase.rpc('ocr_allowance', { p_kind: 'voice' }).maybeSingle();
    if (erroCota) {
      console.error('cota_indisponivel', erroCota.message);
      throw new HttpError(503, 'cota_indisponivel', 'Não foi possível conferir sua cota agora. Tente de novo.');
    }
    const limite = cota as { plan: string; monthly_limit: number | null; used: number; remaining: number | null } | null;
    if (limite && limite.remaining !== null && limite.remaining <= 0) {
      throw new HttpError(429, limite.monthly_limit === 0 ? 'plano_sem_assistente' : 'quota_exhausted',
        limite.monthly_limit === 0
          ? 'O assistente de voz faz parte do plano Meu Carrin IA.'
          : `Você já usou as ${limite.monthly_limit} conversas deste mês. A cota volta no dia 1º; até lá dá para digitar os itens.`);
    }

    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(corpo.audio), (c) => c.charCodeAt(0));
    } catch {
      throw new HttpError(400, 'audio_invalido', 'O áudio chegou corrompido. Tente gravar de novo.');
    }

    const fala = await transcrever(bytes, tipo);
    if (!fala) {
      return json(200, { transcricao: '', resposta: 'Não consegui ouvir nada. Tente falar mais perto do microfone.', itens: [] });
    }
    const { resposta, itens } = await entender(fala);

    // Só conta depois de dar certo: ninguém perde cota por falha nossa.
    await supabase.from('ocr_usage').insert({ kind: 'voice', images: 1, provider: 'openai+anthropic' });

    return json(200, { transcricao: fala, resposta, itens });
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.code, message: e.message });
    console.error('assistente_erro', e instanceof Error ? e.message : String(e));
    return json(500, { error: 'internal', message: 'Não consegui processar sua fala. Tente de novo.' });
  }
});
