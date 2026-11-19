import { doAmbiente, pareceEndereco } from '../../src/lib/config';

const PADRAO_URL = 'https://projeto.supabase.co';
const PADRAO_CHAVE = 'chave-padrao-do-app';
const ehChave = (v: string) => !pareceEndereco(v) && v.length >= 8;

describe('valores vindos do ambiente', () => {
  it('reconhece endereços de servidor', () => {
    expect(pareceEndereco('https://projeto.supabase.co')).toBe(true);
    expect(pareceEndereco('http://localhost:8091')).toBe(true);
    expect(pareceEndereco('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def')).toBe(false);
    expect(pareceEndereco('"https://projeto.supabase.co"')).toBe(false);
    expect(pareceEndereco('https://projeto.supabase.co com espaço')).toBe(false);
  });

  it('usa o valor do ambiente quando ele serve', () => {
    expect(doAmbiente('http://localhost:8091', pareceEndereco, PADRAO_URL, 'URL')).toBe('http://localhost:8091');
    expect(doAmbiente('chave-anon-de-teste', ehChave, PADRAO_CHAVE, 'CHAVE')).toBe('chave-anon-de-teste');
  });

  it('cai no padrão quando o valor está vazio', () => {
    expect(doAmbiente(undefined, pareceEndereco, PADRAO_URL, 'URL')).toBe(PADRAO_URL);
    expect(doAmbiente('   ', pareceEndereco, PADRAO_URL, 'URL')).toBe(PADRAO_URL);
  });

  it('ignora o engano de trocar endereço e chave entre os dois campos', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc.def';
    const url = 'https://projeto.supabase.co';
    // Foi isso que derrubou a versão no ar em 19/11/2026.
    expect(doAmbiente(jwt, pareceEndereco, PADRAO_URL, 'URL')).toBe(PADRAO_URL);
    expect(doAmbiente(url, ehChave, PADRAO_CHAVE, 'CHAVE')).toBe(PADRAO_CHAVE);
  });

  it('descarta aspas coladas junto com o valor', () => {
    expect(doAmbiente('"https://outro.supabase.co"', pareceEndereco, PADRAO_URL, 'URL')).toBe(PADRAO_URL);
  });
});
