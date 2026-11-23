import { descreverItem, lerItem, lerItens } from '@/domain/assistente';

describe('leitura do que o assistente entendeu', () => {
  it('aproveita nome, marca, quantidade e unidade', () => {
    expect(lerItem({ nome: 'Arroz', marca: 'Tio João', quantidade: 2, unidade: 'kg' })).toEqual({
      nome: 'Arroz',
      marca: 'Tio João',
      quantidade: 2,
      unidade: 'kg',
      observacao: null,
    });
  });

  it('grama e mililitro viram quilo e litro, que é como o mercado cobra', () => {
    expect(lerItem({ nome: 'Queijo', quantidade: 500, unidade: 'g' })).toMatchObject({ quantidade: 0.5, unidade: 'kg' });
    expect(lerItem({ nome: 'Leite', quantidade: 350, unidade: 'ml' })).toMatchObject({ quantidade: 0.35, unidade: 'l' });
  });

  it('pacote com peso fica como unidade, com o peso na observação', () => {
    expect(lerItem({ nome: 'Café', quantidade: 3, unidade: 'un', observacao: 'pacote de 500 g' })).toMatchObject({
      quantidade: 3,
      unidade: 'un',
      observacao: 'pacote de 500 g',
    });
  });

  it('quantidade não dita continua não dita — não vira 1', () => {
    expect(lerItem({ nome: 'Banana' })?.quantidade).toBeNull();
    expect(lerItem({ nome: 'Banana', quantidade: 0 })?.quantidade).toBeNull();
    expect(lerItem({ nome: 'Banana', quantidade: -2 })?.quantidade).toBeNull();
    expect(lerItem({ nome: 'Banana', quantidade: 999999 })?.quantidade).toBeNull();
  });

  it('item sem nome é descartado', () => {
    expect(lerItem({ quantidade: 2, unidade: 'kg' })).toBeNull();
    expect(lerItem({ nome: '   ' })).toBeNull();
  });

  it('unidade desconhecida vira unidade avulsa, sem inventar conversão', () => {
    expect(lerItem({ nome: 'Alface', quantidade: 2, unidade: 'maço' })).toMatchObject({ quantidade: 2, unidade: 'un' });
  });

  it('lista ignora o que não dá para aproveitar e não cresce sem limite', () => {
    expect(lerItens([{ nome: 'Arroz' }, { quantidade: 3 }, null, 'arroz'])).toHaveLength(1);
    expect(lerItens('nada disso')).toEqual([]);
    expect(lerItens(Array.from({ length: 50 }, () => ({ nome: 'Item' })))).toHaveLength(30);
  });

  it('descreve o item como a linha da conferência mostra', () => {
    expect(descreverItem(lerItem({ nome: 'Arroz', marca: 'Tio João', quantidade: 2, unidade: 'kg' })!))
      .toBe('2 kg · Arroz Tio João');
    expect(descreverItem(lerItem({ nome: 'Banana' })!)).toBe('Banana');
    expect(descreverItem(lerItem({ nome: 'Leite', quantidade: 1.5, unidade: 'L' })!)).toBe('1,5 L · Leite');
  });
});
