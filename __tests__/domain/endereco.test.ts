import { dentroDoBrasil, interpretarLugar, LIMITES_BRASIL } from '../../src/domain/endereco';

// Respostas reais do buscador (OpenStreetMap), reduzidas aos campos que o app usa.
const RUA = {
  lat: '-23.8083084',
  lon: '-46.0392363',
  name: 'Avenida da Orla',
  category: 'highway',
  type: 'residential',
  address: { road: 'Avenida da Orla', suburb: 'Riviera', city: 'Bertioga', 'ISO3166-2-lvl4': 'BR-SP' },
};
const MERCADO = {
  lat: '-23.7929',
  lon: '-46.0264',
  name: 'Pão de Açúcar',
  category: 'shop',
  type: 'supermarket',
  address: { road: 'Avenida Marginal', house_number: '100', suburb: 'Riviera de São Lourenço', city: 'Bertioga', 'ISO3166-2-lvl4': 'BR-SP' },
};

describe('limites do Brasil', () => {
  it('aceita coordenadas do país', () => {
    expect(dentroDoBrasil(-23.8083, -46.0392)).toBe(true); // Bertioga
    expect(dentroDoBrasil(-3.1, -60.02)).toBe(true); // Manaus
  });

  it('recusa o que caiu fora — o toque no mapa na África que derrubava o cadastro', () => {
    expect(dentroDoBrasil(-18.7, 46.8)).toBe(false); // Madagascar
    expect(dentroDoBrasil(0, 0)).toBe(false);
    expect(dentroDoBrasil(Number.NaN, -46)).toBe(false);
  });

  it('usa os mesmos limites da restrição do banco', () => {
    expect(LIMITES_BRASIL).toEqual({ latMin: -34, latMax: 6, lngMin: -75, lngMax: -28 });
  });
});

describe('resultado da busca vira campos do formulário', () => {
  it('uma rua preenche endereço, bairro, cidade e UF, mas não o nome do mercado', () => {
    const r = interpretarLugar(RUA)!;
    expect(r.nome).toBeNull();
    expect(r.endereco).toBe('Avenida da Orla');
    expect(r.bairro).toBe('Riviera');
    expect(r.cidade).toBe('Bertioga');
    expect(r.uf).toBe('SP');
    expect(r.latitude).toBeCloseTo(-23.8083084);
  });

  it('um comércio também sugere o nome e o número', () => {
    const r = interpretarLugar(MERCADO)!;
    expect(r.nome).toBe('Pão de Açúcar');
    expect(r.endereco).toBe('Avenida Marginal, 100');
    expect(r.rotulo).toContain('Pão de Açúcar');
    expect(r.rotulo).toContain('Bertioga - SP');
  });

  it('descarta resultado fora do Brasil', () => {
    expect(interpretarLugar({ ...RUA, lat: '-18.7', lon: '46.8' })).toBeNull();
  });

  it('descarta resultado sem coordenada', () => {
    expect(interpretarLugar({ name: 'Mercado sem mapa' })).toBeNull();
  });

  it('sobrevive a resultado sem endereço detalhado', () => {
    const r = interpretarLugar({ lat: '-23.5', lon: '-46.6', display_name: 'Algum lugar, São Paulo' })!;
    expect(r.endereco).toBeNull();
    expect(r.rotulo).toBe('Algum lugar, São Paulo');
  });
});
