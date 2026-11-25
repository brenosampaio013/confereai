import { Text } from 'react-native';
import { soTexto } from '@/ui/components';

// Um <Banner> com texto misturado a variáveis — `{preco} / {unidade}, registrado {quando}.` — recebe
// uma lista de pedaços, não uma string. Se isso não for envolvido num <Text>, a web mostra o texto
// na fonte do navegador e o React Native recusa texto solto dentro de uma <View>.
describe('conteúdo que é só texto', () => {
  it('uma string', () => {
    expect(soTexto('Informe os dados do produto.')).toBe(true);
  });

  it('texto misturado com variáveis, que vira uma lista de pedaços', () => {
    const preco = 'R$ 19,90';
    expect(soTexto([preco, ' / ', 'un', ', registrado ', 'hoje', '.'])).toBe(true);
  });

  it('números e partes condicionais vazias também contam como texto', () => {
    expect(soTexto(['Até ', 5, ' fotos.', false, null, undefined])).toBe(true);
  });

  it('conteúdo com componente não é só texto e é mostrado como veio', () => {
    expect(soTexto(<Text>já é texto</Text>)).toBe(false);
    expect(soTexto(['Veja: ', <Text key="a">link</Text>])).toBe(false);
  });

  it('nada não é texto', () => {
    expect(soTexto(null)).toBe(false);
    expect(soTexto([false, null])).toBe(false);
  });
});
