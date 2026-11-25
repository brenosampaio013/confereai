O Meu Carrin confere o cupom do supermercado: a pessoa registra o que põe no carrinho e, no caixa, vê se o que foi cobrado bate com o que levou. O visual precisa passar confiança e calma num momento de pressa (a fila do caixa), com uma mão só e o celular no sol. Verde floresta para agir, verde claro para destacar, fundos brancos e cinza suave, e um único detalhe memorável: a serrilha do cupom.

## Voz e texto

- Fale com a pessoa de "você", em frases curtas e no presente. Português do Brasil, sem gíria e sem exclamação.
- Botões começam com verbo e dizem o que acontece: "Escanear produto", "Conferir o cupom", "Salvar orçamento". A mensagem de retorno usa a mesma palavra ("Orçamento salvo").
- Títulos e rótulos em minúsculas, como frase. Nada de caixa-alta, nem nos selos e nas abas.
- Erro diz o que aconteceu e como resolver, sem pedir desculpas: "A foto ficou escura. Tire outra com o cupom inteiro e bem iluminado."
- Tela vazia convida a agir: "Nenhuma compra salva ainda. Suas compras e conferências aparecem aqui." e o botão "Nova compra".
- Dinheiro sempre em reais no formato brasileiro, "R$ 1.234,56", com espaço depois do R$. Diferença com sinal: "+ R$ 3,00".
- Nunca anuncie economia, número de usuários, avaliação ou recurso que o app não tem de verdade. Sem emoji na interface.

## Cor

- Fundo de toda tela: `fundo`. Cartões, campos, menus e o cupom: `superficie`. Contorno de cartão: `linha`; contorno de campo e de botão secundário: `borda-campo` (é o que garante 3:1).
- Texto: `tinta` para o principal, `tinta-suave` para apoio, `tinta-fraca` só para exemplo em campo e datas.
- **`acao` (verde floresta) é a cor de agir**: botão principal, botão de escanear, seletor ativo, links, ícones tocáveis. Texto sobre ela: `sobre-acao`.
- **`broto` (verde claro) é o destaque**: preenchimento com texto `sobre-broto` (botão Concluir, barra de orçamento) e ícones sobre `destaque`. Nunca como texto e nunca como marca sobre branco.
- **`destaque`** é a superfície verde escura de no máximo um painel por tela: o que a pessoa veio ver. Texto `sobre-destaque` e `sobre-destaque-suave`.
- Estados têm cor **e** ícone **e** palavra: `sucesso` "Sem divergências", `atencao` "Revisar", `erro` "Atenção" / "Cobrado a mais". Cada um tem o par `-suave` para fundo.
- `marinho`, `marca-meu` e `marca-carrin` existem só no logotipo. Não use em interface.
- O tema escuro troca os valores; os nomes são os mesmos. No escuro, `acao` vira verde claro com texto escuro em cima, e a elevação vem da superfície mais clara, não de sombra.

Todos os pares de texto foram medidos: no mínimo 4,5:1 nos dois temas (texto principal sobre `fundo`: 15,4:1 no claro, 15,8:1 no escuro). `broto` sobre branco dá 2,3:1, por isso a regra acima.

## Tipografia

- Uma família só: **Archivo** (a mesma do site), pesos 400 a 800. Ícones: **Ionicons**.
- Escala: `vitrine` (só o título do site), `display` (abertura de tela, um por tela), `titulo`, `subtitulo`, `corpo`, `corpo-forte`, `pequeno`, `legenda`.
- Dinheiro: `dinheiro` em linha e `dinheiro-grande` para o único número que a tela existe para mostrar (a diferença da conferência, o saldo). Sempre com algarismos tabulares (`font-variant-numeric: tabular-nums`; no app, `fontVariant: ['tabular-nums']`), para as colunas de valores alinharem.
- Linhas de texto corrido com até 70 caracteres. Alinhamento à esquerda; centralizado só no estado vazio.

## Espaço, raios e sombras

- Margem lateral das telas: `espaco-lg` (16px). Entre seções: `espaco-xl`. Dentro de cartão: `espaco-md` entre elementos.
- Nenhum controle tocável menor que `alvo-toque` (48px). Botões têm 52px; o compacto, 44px com área de toque estendida.
- Raios com hierarquia: `raio-md` para controles (botão, campo, aviso), `raio-lg` para cartões e o cupom, `raio-xl` para o painel de destaque e o topo das folhas, `raio-pill` para selos e contador.
- Cartões comuns não têm sombra, só contorno `linha`. Sombra existe em dois lugares: `sombra-flutuante` (menu, folha, botão de escanear) e `sombra-destaque` (o painel verde).

## A serrilha

A borda dentada do cupom já está no logotipo. Na interface ela aparece **só** no componente `Cupom`, o resultado da conferência, e no site como divisor da seção que explica a conferência. Não use em botões, cartões comuns ou fundos.

## Movimento

- Só em resposta a um gesto: pressionar (`duracao-rapida`), abrir menu ou mostrar aviso (`duracao-media`), subir folha ou revelar o resultado (`duracao-lenta`). Entradas com `curva-saida`, saídas com `curva-entrada`.
- Nenhuma animação de entrada em seções ou cartões. Com "reduzir movimento" ligado, tudo vira troca imediata.

## Foco e acessibilidade

- Foco do teclado: anel `foco` de 2px, afastado 2px do controle, nos dois temas (mais de 7:1 sobre `fundo` e `superficie`).
- Campo com foco: contorno `acao` com 2px. Campo com erro: contorno `erro` e mensagem com ícone embaixo, ligada ao campo.
- Erro é anunciado na hora (`role="alert"`); os demais avisos, `role="status"`. Botão só de ícone sempre tem rótulo.

## Iconografia

- **Ionicons** pelo `@expo/vector-icons` (a fonte é a mesma do app). Contorno (`*-outline`) para navegação e ações; cheio só para estado (`checkmark-circle`, `alert-circle`, `warning`).
- Tamanhos: 24px em abas e botões de ícone, 21px dentro de botão, 14px em selo.
- Ícones das ações principais: escanear `barcode-outline`, carrinho `cart-outline`, cupom `receipt-outline`, preços `stats-chart-outline`, ofertas `pricetags-outline`.
- Sem emoji e sem ilustração decorativa.

## Logotipo

- `assets/Logos/simbolo.svg`: o símbolo, carrinho com o cupom serrilhado e o visto verde, sobre quadrado `marinho`. Use como está; não recolorir.
- Ao lado do símbolo, "Meu Carrin" em Archivo 800: "Meu" em `marca-meu` e "Carrin" em `marca-carrin`, como em `src/ui/Logo.tsx` (no escuro, "Meu" fica branco: a prop `light`).
- O logotipo fica como está, marinho e verde. O verde da marca (`marca-carrin`) não é o verde de ação (`acao`): não troque um pelo outro.

## Do código atual para os tokens

A API dos componentes não muda; muda o que cada nome de `src/ui/theme.ts` aponta:

| `theme.ts` hoje | passa a ser |
|---|---|
| `navy` (botão principal, ícones) | `acao` |
| `navyPressed` | `acao-pressionada` |
| `navySoft` | `acao-suave` |
| `green` (botão confirmar) | `broto` com texto `sobre-broto` |
| `greenText` / `greenSoft` | `sucesso` / `sucesso-suave` |
| `yellow`, `yellowText`, `yellowSoft` | `atencao-forte`, `atencao`, `atencao-suave` |
| `red`, `redText`, `redSoft` | `erro-forte`, `erro`, `erro-suave` |
| `bg`, `surface`, `surfaceAlt`, `border` | `fundo`, `superficie`, `superficie-alt`, `linha` (+ `borda-campo` nos campos) |
| `text`, `textMuted`, `textFaint` | `tinta`, `tinta-suave`, `tinta-fraca` |
| paleta `soft` (telas de entrada) | sai; login e cadastro usam `Field` e `Button` |
| `type.caption` | `legenda`; rótulos escritos em caixa-alta no código (como "CARRINHO" no relatório) passam para minúsculas |

## Licenças

Archivo: SIL Open Font License 1.1. Ionicons: MIT.
