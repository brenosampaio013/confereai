/**
 * Utilitários para documentos fiscais eletrônicos brasileiros (NFC-e modelo 65 / NF-e 55).
 *
 * O QR Code da NFC-e contém uma URL do portal de consulta da SEFAZ do estado emissor e a
 * chave de acesso de 44 dígitos. A chave, por si só, revela: UF, ano/mês de emissão, CNPJ do
 * emitente, modelo, série e número. Em emissões em contingência (offline) o QR Code também
 * traz o valor total da nota. A lista de produtos NÃO está no QR Code: ela só pode ser vista
 * no portal da SEFAZ, cujo formato e eventuais mecanismos anti-robô variam por estado.
 * O aplicativo não faz raspagem desses portais; ele apenas abre a URL oficial lida do próprio
 * documento para o usuário consultar.
 */
import { Cents, parseBRL } from './money';

export const UF_BY_CODE: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA',
  '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
  '41': 'PR', '42': 'SC', '43': 'RS',
  '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
};

export function isValidCnpj(value: string): boolean {
  const c = value.replace(/\D/g, '');
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + Number(c[i]) * w, 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

export function formatCnpj(value: string): string {
  const c = value.replace(/\D/g, '');
  if (c.length !== 14) return value;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

/** Dígito verificador da chave de acesso (módulo 11, pesos 2..9). */
export function accessKeyCheckDigit(first43: string): number {
  let sum = 0;
  let w = 2;
  for (let i = first43.length - 1; i >= 0; i--) {
    sum += Number(first43[i]) * w;
    w = w === 9 ? 2 : w + 1;
  }
  const r = sum % 11;
  return r === 0 || r === 1 ? 0 : 11 - r;
}

export interface AccessKeyInfo {
  key: string;
  valid: boolean;
  uf: string | null;
  year: number;
  month: number;
  cnpj: string;
  model: string;
  series: number;
  number: number;
}

export function parseAccessKey(raw: string): AccessKeyInfo | null {
  const key = raw.replace(/\D/g, '');
  if (key.length !== 44) return null;
  return {
    key,
    valid: accessKeyCheckDigit(key.slice(0, 43)) === Number(key[43]),
    uf: UF_BY_CODE[key.slice(0, 2)] ?? null,
    year: 2000 + Number(key.slice(2, 4)),
    month: Number(key.slice(4, 6)),
    cnpj: key.slice(6, 20),
    model: key.slice(20, 22),
    series: Number(key.slice(22, 25)),
    number: Number(key.slice(25, 34)),
  };
}

export interface NfceQrInfo {
  url: string | null;
  accessKey: AccessKeyInfo;
  /** Valor total, presente apenas em QR Codes de emissão em contingência (offline) ou na versão 1. */
  totalCents: Cents | null;
  /** Dia de emissão (contingência v2) ou data/hora (v1), quando presente. */
  issuedDay: number | null;
  version: '1' | '2' | '3' | 'unknown';
  environment: 'production' | 'homologation' | null;
}

/**
 * Interpreta o conteúdo de um QR Code de NFC-e.
 * Formatos suportados:
 *  - v2/v3 online:  ...?p=CHAVE|2|tpAmb|cIdToken|hash
 *  - v2 offline:    ...?p=CHAVE|2|tpAmb|dia|vNF|digVal|cIdToken|hash
 *  - v1:            ...?chNFe=CHAVE&nVersao=100&tpAmb=1&...&vNF=12.34&...
 */
export function parseNfceQr(content: string): NfceQrInfo | null {
  const text = content.trim();
  const url = /^https?:\/\//i.test(text) ? text : null;
  const query = text.includes('?') ? text.slice(text.indexOf('?') + 1) : text;
  const params = new Map<string, string>();
  for (const kv of query.split('&')) {
    const eq = kv.indexOf('=');
    if (eq > 0) params.set(kv.slice(0, eq).toLowerCase(), safeDecode(kv.slice(eq + 1)));
  }

  const p = params.get('p');
  if (p) {
    const fields = p.split('|');
    const ak = parseAccessKey(fields[0] ?? '');
    if (!ak) return null;
    const version = fields[1] === '2' ? '2' : fields[1] === '3' ? '3' : 'unknown';
    const env = fields[2] === '1' ? 'production' : fields[2] === '2' ? 'homologation' : null;
    // Offline: CHAVE|versao|tpAmb|dia|vNF|digVal|cIdToken|hash (8 campos)
    const offline = fields.length >= 8;
    return {
      url,
      accessKey: ak,
      totalCents: offline ? parseDotDecimal(fields[4]) : null,
      issuedDay: offline && /^\d{1,2}$/.test(fields[3]) ? Number(fields[3]) : null,
      version,
      environment: env,
    };
  }
  const ch = params.get('chnfe');
  if (ch) {
    const ak = parseAccessKey(ch);
    if (!ak) return null;
    const tp = params.get('tpamb');
    return {
      url,
      accessKey: ak,
      totalCents: params.has('vnf') ? parseDotDecimal(params.get('vnf')!) : null,
      issuedDay: null,
      version: '1',
      environment: tp === '1' ? 'production' : tp === '2' ? 'homologation' : null,
    };
  }
  // QR contendo apenas a chave
  const ak = parseAccessKey(text);
  return ak ? { url: null, accessKey: ak, totalCents: null, issuedDay: null, version: 'unknown', environment: null } : null;
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** "12.34" (formato do QR Code) → 1234 centavos. */
function parseDotDecimal(s: string | undefined): Cents | null {
  if (!s || !/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return parseBRL(s.includes('.') ? s.replace('.', ',') : s);
}

/** Só permite abrir URLs de portais oficiais de consulta (domínio .gov.br). */
export function isOfficialConsultUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const host = url.replace(/^https?:\/\//i, '').split(/[/?#]/)[0].toLowerCase();
    return /\.gov\.br$/.test(host);
  } catch {
    return false;
  }
}
