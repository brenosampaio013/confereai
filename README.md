# Meu Carrin

Aplicativo para conferir compras de supermercado: registre os produtos enquanto compra, fotografe o cupom fiscal no caixa e veja possíveis cobranças duplicadas, diferenças de quantidade, de preço e itens não localizados.

> **Status:** aplicativo funcional, com testes automatizados executados. **Ainda não foi testado em um celular físico** nem com cupons fiscais reais (veja [Estado dos testes](#estado-dos-testes)).

> **Marca:** o aplicativo se chama **Meu Carrin** (endereço: `meucarrin.com`). O repositório no GitHub, o Worker do Cloudflare (`name` em `wrangler.jsonc`) e o caminho `/confereai` do GitHub Pages continuam com o nome anterior: são identificadores de infraestrutura e renomeá-los quebraria a publicação automática. O nome do arquivo do banco local (`confere-ai.db`) também não muda, para não apagar os dados de quem já usa o app.

---

## Sumário

1. [Funcionalidades](#funcionalidades)
2. [Tecnologias](#tecnologias)
3. [Arquitetura e pastas](#arquitetura-e-pastas)
4. [Como executar](#como-executar)
5. [Abrir no celular (câmera)](#abrir-no-celular)
6. [Publicar no Cloudflare](#publicar-no-cloudflare)
7. [Posicionamento](#posicionamento)
8. [Landing page (site de apresentação)](#landing-page-site-de-apresentação)
9. [Publicar na Netlify](#publicar-na-netlify)
10. [Marketplace de ofertas](#marketplace-colaborativo-de-ofertas)
11. [Telas de conta](#telas-de-conta)
12. [Configurar o Supabase](#configurar-o-supabase)
13. [Planos e assinatura (Stripe)](#planos-e-assinatura-stripe)
14. [Configurar o OCR / IA](#configurar-o-ocr--ia)
15. [Testes](#testes)
16. [Gerar versões (EAS)](#gerar-versões-eas)
17. [Regras de negócio importantes](#regras-de-negócio-importantes)
18. [QR Code da NFC-e: possibilidades e limites](#qr-code-da-nfc-e)
19. [Privacidade e segurança](#privacidade-e-segurança)
20. [Estado dos testes](#estado-dos-testes)
21. [Limitações e problemas conhecidos](#limitações-e-problemas-conhecidos)

---

## Funcionalidades

| Área | O que existe |
|---|---|
| **Modo A — escanear durante a compra** | Leitor de código de barras (EAN-13, EAN-8, UPC-A, UPC-E, Code 128, ITF-14, Code 39), lanterna, digitação manual com validação do dígito verificador, último produto, total em tempo real, indicação de leitura. |
| **Proteção contra leitura repetida** | A repetição técnica (código parado diante da câmera) é ignorada; uma nova leitura intencional de produto já registrado abre a confirmação “Você já adicionou este produto” (Adicionar mais uma unidade / Corrigir leitura / Cancelar). Todos os eventos ficam registrados. |
| **Produtos** | Cadastro local por código de barras (nome, marca, embalagem, unidade de venda, foto opcional). Produto desconhecido: cadastro manual, sem inventar nome ou preço. Sugestão opcional da base pública Open Food Facts, sempre para confirmação. |
| **Preços** | Digitado, leitura de etiqueta por OCR (com revisão), ou reconfirmação do último preço. A origem do preço é gravada. Preço por kg/L nunca é confundido com preço da embalagem; preço promocional exige confirmação das condições. |
| **Carrinho** | Adicionar, aumentar/diminuir, remover (com confirmação), corrigir preço, desconto e condições; itens por unidade, kg ou litro (peso em gramas/mL via casas decimais); salvamento automático; histórico de alterações por item. |
| **Modo B — conferir nota fiscal** | Foto(s) da câmera ou galeria, até 6 partes de um cupom longo (reordenáveis), leitura do QR Code da NFC-e, ou digitação manual dos itens. |
| **Leitura do cupom** | OCR/IA no servidor transcreve o texto; um **parser determinístico** extrai estabelecimento, CNPJ, data, itens, quantidades, unidades, preços, descontos, acréscimos, cancelamentos, subtotal e total. Sobreposição entre fotos é removida só quando há evidência; em caso de dúvida a linha é mantida e sinalizada. |
| **Revisão** | Corrigir descrição, quantidade, unidade, preço, total e desconto de cada linha; excluir/adicionar linhas; ver linhas não interpretadas; leitura marcada como incompleta quando faltam dados ou a soma não fecha. |
| **Motor de conferência** | Carrinho × nota (código de barras, associação manual, descrição + embalagem) ou somente a nota. Resultado em verde/amarelo/vermelho com explicação em linguagem simples. |
| **Relatório** | Totais, diferença, itens conferidos e pendências; grupos: duplicadas, quantidade, preço, não localizados, descontos/ajustes, revisão manual, itens sem divergência; comparação lado a lado; ações por tipo (confirmar quantidade, revisar, marcar para verificar no caixa, associar, adicionar ao carrinho, ignorar); reconferência preservando decisões. |
| **Histórico** | Todas as compras com filtros (pendências/incompletas), detalhes, relatório, registro de leituras, exclusão. Histórico de preços por produto com variação em relação ao registro anterior. |
| **Offline** | Banco SQLite local; tudo funciona sem internet, exceto leitura automática (OCR) e sincronização, o que é informado na interface. |
| **Conta e nuvem** | Opcional. E-mail/senha, recuperação de senha, sessão em armazenamento seguro (Keychain/Keystore), sincronização idempotente, exclusão de dados locais e da conta. |

## Tecnologias

| Camada | Escolha | Motivo |
|---|---|---|
| App | **Expo SDK 58**, React Native 0.88, React 19.3, **TypeScript** | Versões mais recentes estáveis; todas as dependências nativas resolvidas pelo mapa de compatibilidade do próprio Expo (`expo install`). |
| Navegação | **Expo Router** (abas + pilha) | Rotas por arquivo em `src/app`. |
| Câmera / códigos | **expo-camera** (`CameraView` + `barcodeScannerSettings`) | Leitor oficial mantido pelo Expo, funciona no SDK 58; substitui o antigo `expo-barcode-scanner`. |
| Fotos | expo-image-picker, expo-image-manipulator | Câmera/galeria e compressão antes do envio. |
| Banco local | **expo-sqlite** | Funciona offline; mesmo dialeto usado nos testes (`node:sqlite`). |
| Nuvem | **Supabase** (Postgres, Auth, RLS, Edge Functions) | Sem Storage: as imagens fiscais não são guardadas. |
| OCR / IA | Edge Function `receipt-ocr` com **Claude (Anthropic)** ou **Google Cloud Vision** | Chaves só no servidor; o app recebe apenas texto. |
| Testes | Jest (jest-expo), `node:sqlite`, PGlite (PostgreSQL em WASM) + `node:test` | Regras de negócio, persistência e políticas RLS reais. |

## Arquitetura e pastas

```
src/
  app/                 Telas (Expo Router)
    (tabs)/            Início, Carrinho, Histórico, Conta
    scan.tsx           Leitor de código de barras
    item/              Adicionar / editar item
    label.tsx          Leitura de etiqueta de preço
    receipt/           Captura (fotos, QR) e revisão do cupom
    report/[id].tsx    Resultado da conferência
    auth/              Telas de conta: entrar, criar conta, recuperar, confirmar, nova senha
    purchase/, product/, privacy.tsx
  domain/              Regras de negócio puras (sem React, 100% testáveis)
    money.ts           Centavos, parse/format BRL, arredondamento inteiro
    units.ts           Unidade, peso/volume em milésimos, embalagens
    cart.ts            Totais, validação, GTIN/UPC-E
    scanGuard.ts       Repetição técnica × leitura intencional
    receiptParser.ts   Texto OCR → itens/totais, emenda de fotos, validação
    matching.ts        Similaridade de descrições (abreviações, embalagem)
    reconciliation.ts  Motor de conferência e divergências
    labelParser.ts     Etiquetas de gôndola
    fiscal.ts          CNPJ, chave de acesso, QR Code NFC-e
    priceHistory.ts    Comparação com o último preço
    auth.ts            E-mail, exigências e força da senha, mensagens do servidor em português
  data/                Persistência
    schema.ts          Migrações SQLite locais
    repository.ts      Leitura/escrita, exclusão lógica, histórico de edições, fila de sincronização
    sync.ts            Envio/recebimento com o Supabase
    expoDriver.ts      Adaptador expo-sqlite
  services/            Integrações (Supabase, OCR, Open Food Facts, rede, conferência)
  state/               Contexto do app (compra ativa, sessão, sincronização)
  ui/                  Tema, logotipo e componentes reutilizáveis
    soft.tsx           Peças em relevo das telas de conta (campo, botão, caixa, aviso)
    account.tsx        Moldura, cabeçalho e medidor de senha das telas de conta
  lib/                 Utilitários (ids, formatação, arquivos, permissões)
supabase/
  migrations/          Esquema Postgres + RLS
  functions/receipt-ocr Edge Function de OCR
  tests/               Testes de segurança do banco (PGlite)
__tests__/             Testes Jest + cupons FICTÍCIOS de teste
scripts/generate-icons.mjs  Gera os ícones a partir do SVG da marca
```

Fluxo de dados: as telas chamam o `Repository` (SQLite). Toda escrita grava `updated_at` e entra na fila `sync_queue`. Com conta conectada, o `SyncService` envia a fila ao Supabase (upsert por UUID gerado no aparelho) e recebe alterações de outros aparelhos. A conferência é calculada localmente (`domain/reconciliation.ts`) e salva como relatório.

## Como executar

Pré-requisitos: Node.js 20+ (testado com 22.22) e npm.

```bash
cd confereai
```

```bash
npm install
```

```bash
cp .env.example .env
```

Sem preencher o `.env`, o app funciona totalmente no aparelho (sem conta, sincronização e OCR).

```bash
npx expo start
```

## Abrir no celular

O app usa módulos nativos (câmera com leitor, SQLite, armazenamento seguro). O **Expo Go** (SDK 58) inclui os módulos oficiais usados aqui e deve servir para um primeiro teste; se algo não abrir, use o build de desenvolvimento abaixo. rode `npx expo start` e leia o QR Code exibido no terminal com o app Expo Go (Android) ou com a câmera (iOS), com o celular na mesma rede.

Para um teste fiel ao app final, gere um **build de desenvolvimento** (recomendado para testar a câmera):

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest build --profile development --platform android
```

Instale o APK gerado e então:

```bash
npx expo start --dev-client
```

Com Android Studio/Xcode instalados também é possível compilar localmente: `npx expo run:android` ou `npx expo run:ios`.

## Versão web (instalável pelo Chrome)

O app também roda no navegador e pode ser instalado como aplicativo (PWA) pelo Chrome no Android ou no computador:
<https://brenosampaio013.github.io/confereai/>

- **Publicação automática:** a cada push no `master`, o GitHub Actions (`.github/workflows/deploy-web.yml`) roda os testes, gera o site (`npm run build:web`) e publica no GitHub Pages. Na primeira vez, ative em *Settings → Pages → Source: GitHub Actions*.
- **Instalar:** abra o endereço no Chrome e use *Instalar app* (menu ⋮ → "Instalar app" ou "Adicionar à tela inicial").
- **Funciona sem internet** depois da primeira abertura; os dados ficam no banco local do navegador.
- **Câmera:** o leitor usa a detecção de códigos de barras do próprio navegador (nativa no Chrome para Android; nos demais, uma biblioteca de leitura carregada sob demanda).
- **Detalhe técnico:** o banco SQLite na web precisa de isolamento entre origens (COOP/COEP). Como o GitHub Pages não permite configurar cabeçalhos, o service worker os acrescenta; na primeira visita a página recarrega uma vez sozinha.
- **Limitações na web:** os dados ficam no navegador daquele aparelho (limpar os dados do site apaga tudo, a menos que você use conta e sincronização); confirmações usam as caixas padrão do navegador; vibração não existe na web.

Para gerar e testar localmente:

```bash
npm run build:web
```

## Publicar no Cloudflare

O painel do Cloudflare hoje cria sites estáticos como **Workers**. O repositório já tem o que falta:

- `wrangler.jsonc` — diz que o site é a pasta `dist` e que as rotas internas do app (ex.: `/offers/123`) abertas direto devolvem o app;
- `dist/_headers` (gerado pelo build) — cabeçalhos de isolamento (COOP/COEP) de que o banco local precisa, e o cache. Não é gerado `_redirects`: as rotas internas são tratadas pelo `wrangler.jsonc`, e a regra `/* → /index.html 200` é recusada pelo Cloudflare (*Infinite loop detected in this rule*);
- `.node-version` — Node 22 no build.

Na tela **Set up your application** (depois de escolher o repositório `brenosampaio013/confereai`):

| Campo | Valor |
|---|---|
| Project name | `confereai` (precisa ser igual ao `name` do `wrangler.jsonc`) |
| Build command | `npm run build` — **não deixe em branco** |
| Deploy command | `npx wrangler deploy` (já vem preenchido) |
| Preview command | `npx wrangler preview` (já vem preenchido) |

Depois do primeiro deploy, em **Settings → Build → Variables and Secrets**, cadastre e refaça o deploy:

- `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` — necessárias para o marketplace, a conta e a leitura de imagens. Sem elas o app funciona só no aparelho.
- `EXPO_PUBLIC_WEB_URL` — endereço final do site (ex.: `https://confereai.<sua-conta>.workers.dev` ou um domínio próprio), usado nos links de ofertas compartilhadas.

Elas são usadas **durante o build**, então precisam estar nas variáveis de build, não nas de runtime. Cada push no `master` publica uma versão nova.

> **Estado em 19/11/2026:** o Worker `confereai` está ligado ao repositório e publica a
> cada push no `master`, nos endereços `app.meucarrin.com` e `confereai.<conta>.workers.dev`.
> Antes disso a versão no ar era a compilada em 14/11 às 13:36 — anterior ao commit que
> renomeou o aplicativo para Meu Carrin (15:27 do mesmo dia) — e os clientes viam o nome antigo. No celular, abra o endereço no Chrome e use **Instalar app**.

Erros já encontrados no painel e o que significam:

| Mensagem no log | Causa e correção |
|---|---|
| `The directory specified by the "assets.directory" field ... does not exist: /opt/buildhome/repo/dist` | O campo *Build command* ficou vazio e o site não chegou a ser gerado. Preencha **Settings → Build → Build command** com `npm run build` e use **Retry deployment**. |
| `Invalid _redirects configuration: Line 1: Infinite loop detected in this rule` | Versão anterior gerava `dist/_redirects`; o Cloudflare recusa a regra `/* → /index.html 200`. Já corrigido: o arquivo não é mais gerado e as rotas internas vêm do `not_found_handling` do `wrangler.jsonc`. |

Para publicar do seu computador, sem o painel:

```bash
npx wrangler login
```

```bash
npm run deploy:cf
```

**Verificado aqui** com o próprio runtime do Cloudflare (`wrangler dev`, workerd) servindo a pasta `dist`: a página já abre isolada na primeira visita (sem o recarregamento que o GitHub Pages exige), o banco local grava e lê, rotas internas abertas direto (`/prices`, `/offers/<id>`) respondem 200 com o app, os arquivos com hash ficam em cache de longa duração e o `index.html` e o service worker não, os arquivos de configuração não ficam expostos e o Chrome não aponta impedimento para instalar. **Não testado:** o deploy real na conta do Cloudflare e o uso em celular físico.

## Posicionamento

O Meu Carrin **não é um aplicativo de lista de compras**. Lista é categoria lotada há dez anos e
commodity não se vende. O que ele faz e quase ninguém faz é **conferir o cupom fiscal**: comparar,
item por item, o que a pessoa registrou no carrinho com o que o caixa cobrou.

Por isso a primeira frase, em todo lugar, é a pergunta — **"o mercado te cobrou certo?"** — e não
o total nem o orçamento. O orçamento é o segundo benefício, não o primeiro: ele é o que todo app
de lista promete.

Onde isso está escrito, para manter os três alinhados quando um mudar:

| Onde | Arquivo |
|---|---|
| Ficha da Play Store (nome, descrição curta e completa) | [`store/android/PUBLICACAO.md`](store/android/PUBLICACAO.md) seção 4 |
| Primeira dobra, título da página, Open Graph e perguntas | `site/index.html` |
| Imagem de compartilhamento | `scripts/build-site.mjs` (desenhada no build) |
| Primeira tela do aplicativo | `src/app/(tabs)/index.tsx` |

A demonstração da primeira dobra tem dois atos: os produtos entrando no carrinho e, depois, **a
conferência do cupom**, com uma divergência real aparecendo (café cobrado a R$ 24,90 com etiqueta
de R$ 22,90). É o argumento inteiro numa imagem; antes ela mostrava só o orçamento subindo, que é
o argumento de um app de lista.

Duas regras de redação que não podem ser afrouxadas:

- **Nunca prometer que o app encontra erro de cobrança.** Ele aponta divergências entre o que a
  pessoa registrou e o que foi cobrado — que podem ser engano dela. Por isso "pontos a revisar",
  e por isso o título é uma pergunta. Está nos termos de uso e vale para toda a comunicação.
- **Nada de recurso que não funciona.** O botão do assistente de voz na tela inicial e o botão de
  assinar o plano IA só aparecem quando `planoAnunciado('ia').disponivel` for `true`.

## Landing page (site de apresentação)

A landing é um site estático separado do aplicativo — HTML, CSS e um pouco de JavaScript,
**sem nenhuma dependência nova**. O app é uma SPA e não tem conteúdo para o Google; a
landing tem. São dois Workers no Cloudflare, no mesmo repositório:

| Endereço | O que é | Pasta publicada | Configuração |
|---|---|---|---|
| `meucarrin.com` | landing page | `site-dist/` | `wrangler.site.jsonc` |
| `app.meucarrin.com` | o aplicativo | `dist/` | `wrangler.jsonc` |

Assim o app **não muda de pasta**: nenhum link compartilhado quebra e os cabeçalhos de
isolamento (COOP/COEP), que a landing não precisa, continuam só no app.

### Arquivos

- `site/` — a página (`index.html`, `estilo.css`, `pagina.js`), os termos de uso, a página 404,
  a marca, a fonte Archivo (licença OFL junto) e as capturas do app;
- `scripts/capture-screens.mjs` — gera as capturas dirigindo o **app real** no Chromium, com
  dados de demonstração criados pelo próprio roteiro (`npm run capturas`);
- `scripts/build-site.mjs` — monta `site-dist/`: converte as capturas para WebP em dois
  tamanhos, gera a imagem de compartilhamento, `_headers`, `robots.txt` e `sitemap.xml`;
- `scripts/check-site.mjs` — confere imagens, links, âncoras, acessibilidade básica,
  marcadores do build que não foram substituídos e rolagem lateral no celular.

```bash
npm run build:site && npm run check:site
```

### Variáveis do build

| Variável | Padrão | Para que serve |
|---|---|---|
| `SITE_URL` | `https://meucarrin.com` | endereço canônico, Open Graph e sitemap |
| `SITE_APP_URL` | `https://app.meucarrin.com` | destino de todos os botões "abrir o app" |
| `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` | — | quando as duas existem, a lista de espera do plano pago é publicada; sem elas o formulário sai da página (nada de botão que não funciona) |

### Publicar

> **Estado em 21/11/2026:** os dois Workers publicam a cada push no `master`. A landing demorou
> a funcionar por um motivo que vale registrar: o contêiner de compilação do Cloudflare **não tem
> ffmpeg nem o playwright**, e o `build:site` usava os dois: ffmpeg para converter as capturas em
> WebP e o Chromium para desenhar a imagem de compartilhamento. O build falhava antes de gerar
> qualquer coisa, e como build que falha não cria versão, de fora parecia que nenhuma compilação
> era disparada. Agora os dois resultados ficam versionados — as conversões em
> `site/assets/telas/_webp` e a capa em `site/assets/_gerados` — e as ferramentas só são chamadas
> onde existem. Regra geral para esse script: **nada que o contêiner de compilação não tenha pode
> ser obrigatório**; o artefato vai versionado e a ferramenta vira opcional.
>
> Os comandos da landing são diferentes dos do aplicativo — o deploy **precisa** do
> `-c wrangler.site.jsonc`, senão o `wrangler` lê o `wrangler.jsonc`, cujo `name` é `confereai`,
> e publica o aplicativo por cima da landing.


No painel do Cloudflare, **Create → Workers → Import a repository**, escolhendo o mesmo
repositório e preenchendo:

| Campo | Valor |
|---|---|
| Project name | `meucarrin` (igual ao `name` do `wrangler.site.jsonc`) |
| Build command | `npm run build:site` |
| Deploy command | `npx wrangler deploy -c wrangler.site.jsonc` |

O domínio `meucarrin.com` entrou na conta em 15/11/2026 (servidores de nome trocados na
HostGator), então o build usa os padrões — não é preciso cadastrar `SITE_URL` nem
`SITE_APP_URL`. Depois do primeiro deploy, ligue os endereços em **Settings → Domains &
Routes → Add Custom Domain**: `meucarrin.com` no Worker `meucarrin` e
`app.meucarrin.com` no Worker `confereai`.

Do seu computador: `npm run deploy:site`.

> **Não dá para publicar de dentro de uma sessão do Claude na nuvem.** O envio dos
> arquivos acontece em duas etapas: o token abre uma sessão de upload e o Cloudflare
> devolve um JWT de uso único, que precisa viajar no `Authorization` da etapa seguinte.
> O proxy do container reescreve esse cabeçalho com o token guardado, o JWT nunca chega
> e o upload volta `401`. A conta, o token e o `wrangler deploy` estão certos — o caminho
> é o painel ou o seu computador.

**Verificado aqui** com o runtime do Cloudflare (`wrangler dev`, workerd): a página responde
200 com os cabeçalhos de segurança (incluindo *Content-Security-Policy* que só permite
script e estilo do próprio site), `/termos` e `/privacidade` abrem sem redirecionamento,
endereço inexistente devolve a página 404 com status 404, os arquivos de `assets/` ficam em
cache de um ano e o `_headers` não fica exposto. No Chromium: nenhum erro de console, a
fonte carrega, a demonstração do orçamento roda e o maior elemento visível aparece em menos
de 100 ms. **Não testado:** o deploy real na conta, o domínio próprio e o Safari do iPhone.

### O filme de apresentação

O vídeo da landing é feito em código, no próprio repositório (skill Motion Pro): sete cenas
de HTML e CSS animadas por uma função do tempo e renderizadas quadro a quadro em MP4. Não há
serviço de terceiros nem IA de vídeo no meio.

- `motion-pro/meu-carrin/motion.json` — o roteiro: cenas, durações, quadros-chave, batidas e transições;
- `motion-pro/meu-carrin/cenas/<id>.js|.css` — a composição e o movimento de cada cena;
- `motion-pro/meu-carrin/marca/tokens.css` — as cores e a fonte da marca dentro do filme;
- `site/assets/filme/` — o MP4 e a capa que a página publica (o build tira a seção do ar se o arquivo não existir).

As telas do aplicativo que aparecem no filme são **redesenhadas em HTML e funcionam de verdade**
(o total soma, a barra muda de cor, o aviso sobe), com os mesmos números e as mesmas frases do app.

Para refazer o filme (a skill fica em `~/.claude/skills/.../motion-pro`):

```bash
node <skill>/scripts/storyboard.mjs motion-pro/meu-carrin
```

```bash
node <skill>/scripts/renderizar.mjs motion-pro/meu-carrin --formato 16x9 --fps 30
```

```bash
node <skill>/scripts/sons.mjs motion-pro/meu-carrin
```

O storyboard, o render e o cache não são versionados (são gerados); o roteiro, as cenas, a marca
e a mídia são. `motion-pro/meu-carrin/versoes/v1/` guarda uma cópia intacta das cenas e do
roteiro da primeira versão, antes da remontagem.

**Versão 2 (remontagem de edição).** A v1 tinha a identidade certa e problemas de narrativa:
o número do gancho girava ao acaso em vez de subir, a marca disputava atenção com a tela do
aplicativo logo na cena 2, a passagem do azul-marinho para o papel do cupom era um corte seco
de clima e, na cena do resultado, o número gigante era o gasto do mês em vez do ganho. A v2
refez essas quatro coisas e mais: entrada de verdade para a etiqueta, etiqueta de "+ R$ x,xx"
a cada produto que entra na conta, e o posicionamento "Sua compra sob controle." no fecho.
**Versão 3 (acabamento).** Rodada de refinamento sobre a mesma montagem: visibilidade,
contraste e escala. O ponto mais importante era o clímax — o palco de papel e o cupom tinham
1,15:1 de contraste e o comprovante sumia no fundo; o palco virou papel-kraft e a fita ganhou
sombra de contato. Também caíram o desfoque do odômetro na abertura, a abertura da câmera na
cena da etiqueta (estava desfocando o que era para ler) e a vinheta global; e a cena final
deixou de esmaecer, para a marca ficar de pé até o último quadro.

O detalhe de cada mudança está em `motion-pro/meu-carrin/briefing.md`, em "Rodadas".
`versoes/v1/` e `versoes/v2/` guardam as cenas e o roteiro das versões anteriores.

Dois verificadores da skill rodam sozinhos e valem a pena antes de renderizar:

```bash
node <skill>/scripts/quadros.mjs motion-pro/meu-carrin --pureza
```

`--pureza` confirma que cada cena é função pura do tempo (o mesmo instante dá sempre o mesmo
quadro); sem isso o render fica não determinístico. O "Diretor", que sai junto do storyboard,
critica composição, contraste e intervalos sem batida.

### Ainda pendente na landing

- A tela da leitura por foto foi capturada com uma **resposta simulada** no formato da função
  real. Antes de publicar, rode `npm run capturas` com o Supabase e a chave da API no ar para
  trocá-la por uma leitura verdadeira.
- A lista de espera é agora do plano **Família**, que ainda não existe no aplicativo; ela grava
  com origem `landing-familia`. Avisar essas pessoas depende de um SMTP próprio (ver
  [Telas de conta](#telas-de-conta)); hoje a leitura da lista é pelo painel do Supabase.

## Publicar na Netlify

O arquivo `netlify.toml` já tem tudo: comando de build, pasta publicada, rotas do app e os cabeçalhos de isolamento de que o banco local precisa (como no Cloudflare, a página abre direto, sem o recarregamento da primeira visita que o GitHub Pages exige).

1. Em <https://app.netlify.com>: **Add new site → Import an existing project → GitHub** e escolha `brenosampaio013/confereai`. Os campos de build já vêm do `netlify.toml`; não altere.
2. Para o marketplace e a leitura de cupons, em **Site configuration → Environment variables** cadastre `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` (os mesmos do `.env`) e faça um novo deploy (**Deploys → Trigger deploy**). Sem elas, o app funciona só no aparelho.
3. Cada push no `master` publica uma nova versão automaticamente.

No celular, abra o endereço `https://<seu-site>.netlify.app` no Chrome e use **Instalar app**.

## Marketplace colaborativo de ofertas

A aba **Ofertas** é um marketplace em que qualquer pessoa com conta publica promoções encontradas nos supermercados e todos (inclusive sem conta) podem ver, filtrar e conferir.

**Navegação:** Início · **Ofertas** · Escanear · **Compras** (compra atual + histórico) · **Perfil**.

| Recurso | Como funciona |
|---|---|
| Explorar | Busca, cidade, localização atual (opcional), filtros por supermercado, categoria (11 categorias visuais), distância e preço; ordenação por mais recentes, menor preço ou mais perto; seções "Ofertas recentes" e "Ofertas próximas"; convite para publicar quando não há ofertas. |
| Mapa | MapLibre GL (web) com mapas gratuitos do OpenFreeMap. Um marcador por **unidade de supermercado**, nas coordenadas da unidade cadastrada; toque mostra endereço, quantidade de ofertas, principais ofertas e atalho para todas. No app nativo, lista de unidades com atalho para o app de mapas. |
| Publicar (5 etapas) | Produto (busca nos produtos já cadastrados) → Fotos (até 5; exige etiqueta, placa ou anúncio; recorte e rotação antes do envio; rejeita imagens vazias/formatos inválidos) → Preço (promocional, anterior opcional, unidade, condições especiais, quantidade mínima, datas) → Supermercado (busca, distância, sugestão de novo estabelecimento para análise) → Localização. |
| Localização | Capturada no momento da publicação, com precisão exibida e opção de aguardar mais precisão. O **servidor** recalcula a distância até a unidade (raio padrão 200 m, configurável por unidade e em `marketplace_settings`), recusa leituras com mais de 5 minutos e **descarta as coordenadas** — só distância e precisão são gravadas. Sem localização (ou fora do raio), a oferta vai para análise. |
| Verificação | Indicadores **separados**: localização compatível · comprovada por foto (moderação) · confirmada pela comunidade (3 pessoas diferentes, contas com mais de 24 h) · verificada pela moderação. Nunca há um selo genérico. Desconto só é mostrado quando o preço anterior foi comprovado. |
| Comunidade | "Encontrei", "preço correto", "preço diferente" (com o valor), "acabou", "não encontrei"; foto opcional. Uma resposta por pessoa por oferta (atualizável após 24 h), autor não confirma a própria, limite diário. |
| Duplicidade | Publicação idêntica (mesma unidade, produto, preço, unidade de venda, condições e validade) é desviada para a oferta existente; ofertas parecidas são mostradas antes de publicar; diferenças legítimas são aceitas. |
| Validade | Status: rascunho, aguardando análise, publicada, verificada parcialmente, confirmada pela comunidade, contestada, expirada, removida. Ofertas vencidas somem das buscas imediatamente; `expire_promotions()` atualiza o status (pg_cron a cada 15 min). Histórico de status preservado. |
| Denúncias e moderação | 9 motivos; 3 denúncias deixam a oferta **contestada** (revisão, não remoção). Painel em Perfil → Painel de moderação (só administradores): denúncias, ofertas em análise, estabelecimentos sugeridos, fotos, verificações de localização (distância/precisão), histórico, aprovar/suspender/remover/restaurar, aceitar/rejeitar foto, suspender conta; todas as decisões registradas. |
| Reputação | Novo colaborador → ativo → confiável → destaque. Pesa ofertas confirmadas e preços corretos; denúncias procedentes e remoções reduzem. Colaboradores confiáveis publicam sem localização sem passar por análise. |
| Notificações | Geradas pelo banco apenas a partir de eventos reais: oferta nova na cidade escolhida, categoria/produto favorito, oferta confirmada/contestada, resposta da moderação, favorita perto de vencer. Caixa de avisos no app; push via Edge Function `send-push` (Expo Push). |

### Configuração do marketplace

1. Aplique as migrações (`npx supabase db push`): `20261109120000_marketplace.sql` cria tabelas, funções, RLS, o bucket privado `promotion-images` e, se o projeto tiver **pg_cron**, as tarefas de expiração e retenção. Sem pg_cron, agende `select public.expire_promotions()` (a cada 15 min), `public.purge_stale_drafts()` (diária) e `public.purge_old_promotions()` (mensal) pelo painel do Supabase (Integrations → Cron).
2. Crie o primeiro administrador no *SQL Editor*:

```sql
insert into public.app_admins (user_id) select id from auth.users where email = 'SEU-EMAIL';
```

3. Cadastre os supermercados: pelo app (Publicar → "Não encontrei: sugerir estabelecimento") e aprove em **Painel de moderação → Lojas**, definindo raio e logotipo. O banco começa **sem** estabelecimentos — não há dados inventados.
4. Push (opcional): rode `npx eas-cli@latest init` (gera o `projectId` usado pelo Expo Push), publique a função e agende a chamada:

```bash
npx supabase secrets set PUSH_CRON_SECRET=uma-senha-longa-aleatoria
```

```bash
npx supabase functions deploy send-push --no-verify-jwt
```

   Agende uma requisição `POST https://SEU-PROJETO.supabase.co/functions/v1/send-push` com `Authorization: Bearer <PUSH_CRON_SECRET>` a cada 5 minutos (Supabase Cron + pg_net). Na web os avisos ficam na caixa do app.
5. Parâmetros (raio, precisão máxima, confirmações necessárias, limites diários): tabela `marketplace_settings` (editável por administradores).

### Limitações do marketplace

- **GPS não é prova.** A localização pode ser falsificada em aparelhos modificados e não garante que a promoção exista nem que a pessoa estava dentro da loja. Por isso é apenas um indicador entre outros (foto, confirmações independentes, reputação, moderação).
- **Mapa:** no app nativo o mapa interativo exigiria o MapLibre nativo em um build próprio; hoje o app nativo mostra a lista de unidades com atalho para o app de mapas. Na web o fundo do mapa depende do OpenFreeMap (gratuito, sem garantia de disponibilidade).
- **Endereço → coordenadas:** não há geocodificação automática (evita serviço pago). A posição da loja vem do GPS de quem está nela ou do toque no mapa (web) e é revisada pela moderação.
- **Arquivos de fotos removidas:** a retenção apaga os registros do banco; os arquivos correspondentes no Storage devem ser limpos periodicamente pela API do Storage (ainda não automatizado).
- **Sem PostGIS:** distâncias são calculadas por Haversine em SQL com índice simples de latitude/longitude — adequado para escala de cidade. Para grande volume, migrar para PostGIS (`geography` + índice GiST).

## Orçamento, preços e histórico de gastos

- **Orçamento da compra.** Ao iniciar a compra, o app pergunta quanto você pretende gastar (opcional; pode ser definido ou alterado depois). A cada item adicionado, removido ou alterado, mostra orçamento, total, saldo e percentual usado no carrinho, no leitor e na tela inicial. Avisos em 75% e 85% (configuráveis), ao atingir 100% e sempre que ultrapassar, informando o excesso. O aviso só dispara quando o gasto **sobe** de faixa. Cálculo em centavos inteiros (`src/domain/budget.ts`).
- **Foto do produto com a etiqueta.** Tela `/capture`: a foto é enviada à Edge Function `receipt-ocr` (`kind: "product"`), que identifica nome, marca, peso, código de barras, preço normal, promocional, preço por kg/L, condições e se a etiqueta parece ser daquele produto. A IA copia os textos como impressos; a conversão para centavos e as validações são do app (`src/domain/productCapture.ts`). O resultado apenas preenche o formulário, que o usuário confere e corrige antes de salvar. Dá para adicionar ao carrinho ou só registrar o preço.
- **Histórico de preços por supermercado.** Cada preço guarda data, loja, unidade cadastrada (quando escolhida), promoção e preço normal. A tela do produto mostra o último preço, o preço em cada supermercado, onde está mais barato e a evolução. Preços com mais de 30 dias são marcados como antigos e **não** entram na comparação.
- **Base de preços da comunidade.** Com conta e compra vinculada a uma unidade cadastrada, os preços registrados são enviados à base compartilhada (pode ser desligado no Perfil). Qualquer pessoa consulta o último preço por unidade; ninguém vê quem informou. Um código de barras já cadastrado por alguém vira sugestão de cadastro para os demais. Não depende de base prévia de produtos.
- **Minhas compras.** Toda compra fica salva com data e horário, supermercado e unidade, produtos, quantidades, preços, descontos, total, orçamento planejado e diferença. É possível comparar duas compras (preço dos produtos em comum).
- **Resumo financeiro.** Total do mês, número de compras, média, maior compra, economia registrada (descontos + diferença entre preço normal e promocional), comparação com o mês anterior, gasto por mês e por supermercado.

A migração `supabase/migrations/20261111120000_budget_prices.sql` precisa ser aplicada **antes** de publicar esta versão do app: a sincronização envia as colunas novas (`budget_cents`, `store_location_id`, `regular_price_cents`). Depois, reimplante a função: `npx supabase functions deploy receipt-ocr`.

Limites desta parte: a leitura por IA pode errar e depende de internet e do provedor configurado (com Google Vision só o texto da etiqueta é interpretado; nome e marca ficam para digitar); os preços da comunidade não são verificados; a base compartilhada só recebe preços de unidades cadastradas e aprovadas no marketplace; os percentuais de alerta ficam guardados no aparelho (não sincronizam).

## Telas de conta

Cinco telas, todas sob `/auth`, com a mesma moldura em relevo (soft UI):

| Rota | Tela | O que faz |
| --- | --- | --- |
| `/auth` | Entrar | `signInWithPassword`, com "manter conectado" |
| `/auth/criar-conta` | Criar conta | `signUp` com nome, medidor de senha e aceite da política |
| `/auth/recuperar` | Recuperar senha | `resetPasswordForEmail`, sem revelar se a conta existe |
| `/auth/confirmar` | Confirmação | instrui a confirmar o e-mail e reenvia o link (espera de 60 s) |
| `/auth/nova-senha` | Nova senha | destino do link de recuperação; grava a senha com `updateUser` |

**Onde estão as peças.** `src/ui/soft.tsx` tem o campo afundado, o botão com degradê, a caixa de
seleção e o aviso; `src/ui/account.tsx` tem a moldura, o cabeçalho e o medidor de força;
`src/domain/auth.ts` tem as regras puras (e-mail, exigências da senha, tradução das mensagens do
servidor) e `src/services/auth.ts` conversa com o Supabase. O relevo é feito com `boxShadow`
(suportado pelo React Native 0.88 e pelo react-native-web) e os degradês com `react-native-svg` —
nenhuma biblioteca nova foi instalada.

**"Manter conectado" é de verdade.** Marcado, a sessão vai para o Keychain/Keystore (celular) ou
para o `localStorage` (web) e sobrevive a fechar o aplicativo. Desmarcado, ela fica só na memória
do processo (celular) ou na aba (`sessionStorage`, web) e termina quando o aplicativo fecha. A
troca está em `src/services/secureStorage.ts` e é verificada no teste de ponta a ponta.

**A senha nunca passa pelo aplicativo.** Quem recebe, confere e guarda (em hash) é o serviço de
autenticação do Supabase. O banco local não tem campo de senha.

**O que falta configurar no Supabase** para os e-mails funcionarem (ver a seção seguinte):

- **Site URL**: `https://app.meucarrin.com`
- **Redirect URLs**: `https://app.meucarrin.com/**` e `meucarrin://**` (o esquema do aplicativo)
- Confirmação de e-mail ligada ou desligada — as duas situações estão tratadas: com confirmação,
  o cadastro leva à tela de confirmar; sem ela, entra direto.

**O que NÃO existe nestas telas, de propósito:**

- **Entrar com Google/Facebook.** Não há provedor social configurado no Supabase; um botão desses
  seria desenho sem função. O espaço ficou com "Continuar sem conta", que é verdade — o aplicativo
  funciona inteiro sem conta.
- **Termos de uso.** O projeto tem política de privacidade (`/privacy`), e é ela que o aceite do
  cadastro cita e abre. Quando houver um texto de termos, ele entra na mesma frase.

Acessibilidade conferida no app web real: contraste WCAG 2.1 AA em todos os pares de cor, alvos
de toque de 44 px, foco visível pelo teclado, ordem de foco previsível, erros anunciados
(`role="alert"`) e nenhuma rolagem horizontal com zoom de 200%.

## Configurar o Supabase

**O projeto existe e está configurado** (19/11/2026): `meucarrin`, região São Paulo
(`sa-east-1`), PostgreSQL 17.12. Endereço: `https://urfqgajoauryxmkbseet.supabase.co`.

O que já foi aplicado e conferido:

| Item | Estado |
| --- | --- |
| Migrações | as 4, em ordem — 30 tabelas, 60 políticas RLS, 58 funções, 25 gatilhos |
| RLS | ligado nas 30 tabelas, sem exceção |
| Bucket de fotos | `promotion-images`, privado, 5 MB por arquivo, só JPEG/PNG/WebP |
| Tarefas periódicas | `pg_cron` ativo com os 4 agendamentos (expirar ofertas, limpar rascunhos, apagar ofertas antigas e relatos de preço) |
| Site URL | `https://app.meucarrin.com` |
| Redirect URLs | `https://app.meucarrin.com/**`, `meucarrin://**`, `http://localhost:8081/**` |
| Tamanho mínimo da senha | 8, igual à regra do aplicativo |
| Confirmação de e-mail | **desligada** (ver abaixo) |
| Login anônimo | **desligado** (ver abaixo) |

Conferido contra o servidor real, com uma conta de teste criada e apagada em seguida:
cadastro devolvendo sessão, gatilho criando o perfil, cadastro repetido recusado, login certo
e errado, senha curta recusada, RLS negando leitura sem sessão e devolvendo apenas os dados da
própria conta, e login anônimo recusado.

### Duas decisões tomadas, e o que elas custam

**Confirmação de e-mail desligada.** O envio embutido do Supabase é limitado a poucas mensagens
por hora e a própria Supabase diz que não serve para produção: com a confirmação ligada, a maior
parte dos cadastros não receberia o link. Enquanto estiver assim, alguém pode se cadastrar com um
e-mail que não é dele. Para religar: configure um SMTP próprio (Resend ou Brevo têm plano
gratuito) em **Authentication → Emails → SMTP Settings** e desligue `mailer_autoconfirm`. O
aplicativo já trata os dois casos — com confirmação, o cadastro leva à tela de confirmar.

**Login anônimo desligado.** A leitura automática de cupom e etiqueta passa a exigir conta. O
aplicativo avisa isso na hora, em vez de falhar sem explicação. Para ligar: **Authentication →
Sign In / Providers → Anonymous sign-ins**.

### O que ainda falta

1. **Edge Functions** (`receipt-ocr`, `send-push`, `stripe-checkout`, `stripe-portal`,
   `stripe-webhook`) ainda não foram publicadas — é o que falta para a leitura por IA e para a
   assinatura funcionarem, junto com a chave do provedor de IA e os segredos da Stripe (ver
   [Planos e assinatura](#planos-e-assinatura-stripe) e a seção do OCR).
2. **Primeiro administrador** da moderação: criado em 22/11/2026. Para promover outra conta,
   `insert into public.app_admins (user_id) values ('<id do usuário>');` depois que ela existir
   em `auth.users`. Conferido com `public.is_admin()` e `public.admin_queue()` no papel
   `authenticated` da própria conta, não só pela existência da linha.
3. **Supermercados**: não devem ser inseridos por SQL. Cada unidade exige coordenadas de GPS
   reais, e é por essa distância que o app decide se quem publicou estava mesmo na loja —
   coordenada chutada estraga o recurso em vez de adiantar o início. O caminho é o fluxo que já
   existe: qualquer pessoa sugere a unidade de dentro do aplicativo (`suggest_store`, com a
   localização do aparelho) e a moderação aprova na aba **Lojas** do painel.

### Onde ficam o endereço e a chave

Em `src/lib/config.ts`, como padrão do próprio aplicativo (19/11/2026). Os dois valores são
públicos por natureza — já viajam dentro do pacote que qualquer pessoa baixa, e quem protege os
dados são as políticas RLS, nunca o sigilo da chave. Estavam só no painel de quem compila, e a
compilação saía sem eles; no código, o aplicativo publica certo de qualquer lugar.

As variáveis de ambiente continuam tendo prioridade, então apontar para outro projeto (um de
testes, por exemplo) é só defini-las. A chave `service_role` **nunca** entra no aplicativo.

### Em desenvolvimento, no seu computador

Opcional, para usar outro projeto — um `.env` (fora do Git) com as duas variáveis:

```
EXPO_PUBLIC_SUPABASE_URL=https://urfqgajoauryxmkbseet.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<chave anon public>
```

Para aplicar migrações novas pelo CLI:

```bash
npx supabase link --project-ref urfqgajoauryxmkbseet
```

```bash
npx supabase db push
```

### Busca de endereços no cadastro de unidades

Quem cadastra um supermercado pode procurar o endereço em vez de acertar o ponto no olho. O texto
vai para o serviço público do **OpenStreetMap (Nominatim)**, limitado ao Brasil, e o resultado
preenche endereço, bairro, cidade e UF e marca a coordenada; o mapa voa até lá e a pessoa ajusta
com um toque. Nada é inventado: sem resultado, a lista volta vazia e o aviso diz isso.

Três cuidados que estão no código e convém manter:

- A busca só dispara no toque do botão, nunca a cada tecla — o serviço é gratuito e pede uso
  moderado. Se o volume crescer, o caminho é passar a chamada por uma Edge Function com cache.
- Coordenada fora do retângulo do Brasil é recusada **na tela**, com a mesma regra da restrição do
  banco (`src/domain/endereco.ts`). Antes disso, um toque no mapa fora do país era aceito e só o
  servidor recusava, com a mensagem genérica "alguns dados não são válidos".
- A política de privacidade diz o que é enviado e quando (`src/app/privacy.tsx` e
  `docs/privacidade.html`).

## Planos e assinatura (Stripe)

Dois planos. O **Grátis** tem o aplicativo inteiro sem limite, com cota mensal apenas para a
leitura automática por foto — que é o que custa dinheiro por imagem. O **Meu Carrin Mais**
(R$ 9,90 por mês ou R$ 89 por ano) aumenta essa cota.

### A cota mora no banco, não no código

| plano | balde | por mês |
|---|---|---|
| `gratis` | `etiqueta` (fotos de etiqueta e de produto) | 20 |
| `gratis` | `cupom` (cupom fiscal lido por foto) | 4 |
| `mais` | `total` (qualquer leitura) | 300 |

Isso é a tabela `public.plan_limits`. Mudar uma cota é um `update` — sem publicar aplicativo nem
função. Quando um plano tem mais de uma linha aplicável, vale a mais apertada; plano sem linha
nenhuma é plano sem limite. A janela é o mês civil no fuso de Brasília (`public.month_start()`).

Quem responde "quanto ainda cabe" é `public.ocr_allowance(kind)`, no banco. A função de OCR
consulta ela antes de gastar uma leitura, e a tela de planos mostra o mesmo número — uma conta
só, em um lugar só.

### Quem pode dizer que alguém assinou

Só a Stripe. A tabela `public.subscriptions` é um espelho: tem política de **leitura** da
própria linha e **nenhuma** de escrita para `authenticated`. Quem grava é a função
`stripe-webhook`, com a chave de serviço. Em vez de aplicar o que vem no aviso, ela busca a
assinatura na Stripe e grava o estado atual — assim aviso repetido ou fora de ordem não causa
dano. O teste `supabase/tests/planos.test.mjs` tenta se promover a assinante pelo papel do
aplicativo e confirma que o banco recusa.

### Preços: chave de busca, não identificador

Os preços são achados por `lookup_key` (`mais_mensal`, `mais_anual`), que é igual nos modos de
teste e de produção. Nada de `price_...` colado no código ou em variável de ambiente.

### O que já está no ar (22/11/2026)

- Migração dos planos aplicada no projeto `meucarrin`: `plan_limits` com as três linhas,
  `subscriptions` com uma única política (leitura da própria linha) e as funções `my_plan`,
  `ocr_allowance`, `plan_of` e `month_start`. 32 tabelas, todas com RLS.
- Catálogo na Stripe (conta brasileira, em reais): produto **Meu Carrin Mais**
  (`prod_VfyBMftnvQrVP8`) com os preços `mais_mensal` (R$ 9,90) e `mais_anual` (R$ 89). O produto
  **Plano Meu Carrin Família** foi **arquivado** — ele prometia listas compartilhadas, que o
  aplicativo não tem. Nenhuma assinatura existia, então nada foi interrompido.
- Funções `stripe-checkout`, `stripe-portal` e `stripe-webhook` publicadas (versão 1) e
  `APP_URL` configurada. Conferido no ar: o webhook recusa chamada sem assinatura e com
  assinatura inventada; o checkout recusa chamada sem sessão.
- Endpoint de webhook criado na Stripe (`we_1UecdAKII6I0n2DUWlnGRZOp`), com os oito eventos.

### O que falta, e só você pode fazer

1. **`STRIPE_SECRET_KEY`** e **`STRIPE_WEBHOOK_SECRET`** nos segredos das funções (painel do
   Supabase → Edge Functions → Secrets). O segredo do webhook é revelado no painel da Stripe,
   em Desenvolvedores → Webhooks → o endpoint acima. Enquanto faltarem, o webhook recusa tudo
   e a tela de planos diz que a assinatura não está configurada — falha fechada, de propósito.
2. ~~Revogar os privilégios desnecessários~~ — feito (ver abaixo).

Para publicar de novo depois de mudar o código das funções:

```bash
npx supabase functions deploy stripe-checkout stripe-portal stripe-webhook
```

Segredos da função (ver `supabase/functions/.env.example`): `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `APP_URL`. Nenhum deles entra no aplicativo.

### O terceiro plano: Meu Carrin IA (ainda não à venda)

**R$ 19,90 por mês ou R$ 179 por ano.** O que ele acrescenta é o **assistente de voz**: a pessoa
fala o que precisa e ele devolve os produtos entendidos, para conferir e adicionar. Inclui tudo
do Mais, com 600 leituras automáticas por mês e 150 conversas.

O plano está **marcado como indisponível** em `src/domain/planos.ts` (`disponivel: false`): ele
aparece na tela e na landing como "em breve", **sem botão de assinar**. Não se vende o que o
aplicativo ainda não entrega — foi exatamente esse o problema do plano Família. Para abrir as
vendas: configurar as chaves de IA em produção, exercitar o assistente com áudio de verdade e
só então virar o `disponivel` para `true` e criar os preços `ia_mensal` / `ia_anual` no modo de
produção da Stripe (no modo de teste eles já existem).

A trava do servidor não depende desse campo: o balde `voz` vale **zero** nos planos Grátis e
Mais, e é a própria cota que recusa a conversa. Não há nenhuma regra em código dizendo "quem
pode" — quem decide é a tabela.

### Como funciona o assistente

```
fala → [grava no aparelho] → função `assistente` → transcrição (OpenAI)
                                                 → entendimento (Claude) → itens sugeridos
                                                 → a pessoa confirma item a item
```

Dois fornecedores porque **a Claude não lê áudio** — ela recebe texto, imagem e PDF. A
transcrição vai para a OpenAI, que aceita direto os dois formatos que o aplicativo grava
(`.m4a` no celular, `.webm` no navegador); o Google Speech-to-Text ficaria de fora porque não
aceita AAC. O entendimento fica com a Claude, a mesma que já lê cupons e etiquetas aqui.

Três decisões que valem explicar:

- **A IA não sabe preço, e isso é de propósito.** Ela identifica o produto, como o leitor de
  código de barras faz; o preço continua vindo da etiqueta, pela mão da pessoa. Um carrinho com
  preço inventado destruiria a conferência do cupom, que é o motivo de o aplicativo existir.
- **Nada entra no carrinho sozinho.** Cada item abre a tela de sempre, com nome, marca e
  quantidade preenchidos, para conferir e pôr o preço.
- **O áudio não é guardado.** É lido, enviado, processado em memória e apagado do aparelho logo
  depois. A política de privacidade descreve isso e nomeia os dois fornecedores.

Quantidade falada vira unidade de venda: "quinhentos gramas de queijo" → 0,5 kg; "três pacotes
de café de 500 g" → 3 un, com o peso na observação. Quantidade não dita **continua não dita** —
não vira 1 (`src/domain/assistente.ts`, com testes).

### Moeda sempre em reais

A conta tem o *Adaptive Pricing* ligado, que converte o preço para a moeda de quem acessa — numa
prova aberta daqui, a página mostrou "US$ 1,73 por mês" num plano anunciado por R$ 9,90. Como a
landing e os termos prometem reais, a função passa `adaptive_pricing: { enabled: false }`: o
preço exibido é sempre o anunciado. Para voltar atrás, basta remover essa linha de
`supabase/functions/stripe-checkout/index.ts` — a conta continua com o recurso ligado.

### Catálogo de teste

O modo de teste tem o mesmo catálogo (produto `prod_VgJ5sOzci6KD3p`, preços `mais_mensal` e
`mais_anual`). Como os preços são achados por chave de busca, **nada no código muda entre os
modos**: trocar `STRIPE_SECRET_KEY` de `sk_test_` para `sk_live_` é a única diferença.

Para reconferir o pagamento depois de mexer nas funções: `e2e/pagamento-stripe.mjs` (instruções
no topo do arquivo). Ele não entra em `npm run test:e2e` porque exige uma chave de teste.

### Privilégios que o Supabase concede por padrão (corrigido)

Ao conferir a migração em produção apareceu algo que não é de hoje: projeto Supabase novo tem um
privilégio padrão no schema `public` que concede **tudo** (`arwdDxtm`) a `anon` e a
`authenticated` em cada tabela criada. Conceder `select, insert, update, delete` numa migração
não revoga o que o padrão já deu, então **TRUNCATE ficou de pé em 29 tabelas** para quem tem
conta e em 16 para visitante — `promotions`, `supermarkets` e `app_admins` entre elas.

Tamanho real do risco: o PostgREST não expõe TRUNCATE, então **não há caminho conhecido hoje**
para disparar isso com a chave pública, e as 32 tabelas têm RLS. O que existe é um privilégio que
nenhuma tela usa e que a RLS **não** cobre — TRUNCATE não passa por política de linha. Uma função
futura com `security invoker` ou uma injeção de SQL bastaria para virar perda total de dados.

A correção está em `supabase/migrations/20261122130000_privilegios.sql` e **foi aplicada em
produção pelo editor de SQL do Supabase**. Conferido em 25/11/2026, só por leitura: nenhuma tabela
do schema `public` dá TRUNCATE a `anon` ou a `authenticated`, e o privilégio padrão do papel
`postgres` para tabelas novas ficou em `arwdm` (sem truncate, trigger e references). O privilégio
padrão do papel `supabase_admin` continua concedendo tudo, mas as migrações do projeto criam
tabelas como `postgres`, então ele não as alcança. O banco de teste (`supabase/tests/helpers.mjs`) passou a imitar o
privilégio padrão do Supabase, e há teste conferindo que ninguém consegue esvaziar as tabelas.

### Google Play: por que não há botão de compra no Android

Vender assinatura digital dentro do app por fora da cobrança do Google contraria a política de
pagamentos do Play. O Brasil está na lista de países com *billing* alternativo, mas isso é um
programa com regras próprias, não liberação para checkout externo. Por isso `src/app/planos.tsx`
só mostra o botão quando `Platform.OS !== 'android'`: na web a pessoa assina, e no aplicativo
Android a tela mostra o plano e diz que a assinatura é feita no site. Quando o app for para a
loja, o caminho é implementar a cobrança do Play (ou entrar no programa) — não burlar a regra.

### Pix

A documentação da Stripe diz que contas brasileiras aceitam Pix só avulso; *Pix Automático* não
está disponível para elas. Por isso a assinatura é com cartão. Em modo assinatura a Stripe já
oferece apenas meios que aceitam recorrência, então a função não precisa listar nada.

## Configurar o OCR / IA

A leitura de cupons e etiquetas passa pela Edge Function `receipt-ocr`, que devolve **somente o texto transcrito**. A interpretação dos valores é feita pelo parser determinístico do app. Para a foto do produto com a etiqueta (`kind: "product"`), a função devolve também os campos identificados, como texto impresso; o app converte e valida.

```bash
cp supabase/functions/.env.example supabase/functions/.env
```

Escolha o provedor no `.env` da função:

- `OCR_PROVIDER=anthropic` + `ANTHROPIC_API_KEY` — usa Claude (modelo padrão `claude-opus-5-5`, configurável por `ANTHROPIC_MODEL`) com saída estruturada, esforço baixo e *fallback* automático no servidor em caso de recusa.
- `OCR_PROVIDER=google_vision` + `GOOGLE_VISION_API_KEY` — usa `DOCUMENT_TEXT_DETECTION` do Cloud Vision.

```bash
npx supabase secrets set --env-file supabase/functions/.env
```

```bash
npx supabase functions deploy receipt-ocr
```

A função exige sessão do Supabase, valida tamanho/quantidade de imagens (1–6, ~4,5 MB cada), aplica a cota mensal do plano de cada pessoa (`public.ocr_allowance`, tabelas `plan_limits` e `ocr_usage` — ver [Planos e assinatura](#planos-e-assinatura-stripe)) e não armazena imagens. Ambos os provedores são pagos conforme uso; consulte os preços de cada um.

## Testes

```bash
npm test
```

```bash
npm run test:db
```

```bash
npm run typecheck
```

```bash
npm run lint
```

`npm run test:all` executa typecheck + Jest + testes do banco.

Os cupons usados nos testes (`__tests__/fixtures/receipts.ts`) são **fictícios**, criados apenas para testes automatizados, e estão identificados como tal.

## Gerar versões (EAS)

Perfis em `eas.json`: `development` (dev client), `preview` (APK interno) e `production`.

```bash
npx eas-cli@latest build --profile preview --platform android
```

```bash
npx eas-cli@latest build --profile production --platform all
```

Passo a passo da Google Play (ficha da loja, gráficos, política de privacidade e respostas de “Segurança dos dados”): [`store/android/PUBLICACAO.md`](store/android/PUBLICACAO.md).

Antes de produção: configure as variáveis `EXPO_PUBLIC_*` no EAS (`eas env:create`) ou no `.env`, revise `bundleIdentifier`/`package` em `app.json` (`com.meucarrin.app` é um valor sugerido), preencha o contato de privacidade e revise a política com assessoria jurídica. A publicação nas lojas exige contas Apple Developer / Google Play e etapas manuais (fichas, capturas de tela, classificação, formulário de segurança de dados); nada disso é automático.

## Regras de negócio importantes

- **Dinheiro em centavos inteiros.** Nada de ponto flutuante: `"5,49"` é convertido por manipulação de texto; `preço × quantidade` usa aritmética inteira.
- **Quantidades em milésimos** da unidade de venda (1 un = 1000; 1,250 kg = 1250). Subtotal de item pesado = `round_half_up(preço_por_kg × gramas / 1000)`. Como alguns PDVs **truncam**, a conferência aceita a diferença de 1 centavo entre os dois modos.
- **Repetição de leitura:** a mesma leitura dentro de 2,5 s da última detecção do código é técnica e ignorada (a janela se renova enquanto o código continua visível). Depois disso, uma nova leitura de produto já registrado pede confirmação. Itens digitados nunca são tratados como repetição técnica.
- **Correspondência de produtos:** por código de barras (normalizando zeros à esquerda e UPC-E), associação manual, ou descrição — mas descrição semelhante só associa com segurança se o preço confere ou se a descrição é quase idêntica **e** a embalagem declarada é a mesma. Embalagens diferentes (1 kg × 500 g) nunca são associadas. Nos demais casos aparece “Confirme a associação”.
- **Duplicidade:** sem carrinho, linhas repetidas geram apenas alerta amarelo explicando que pode ser compra legítima. Com carrinho, cobrança acima da quantidade registrada gera alerta vermelho com a diferença potencial.
- **Descontos:** comparados pelo valor líquido. Desconto na nota não gera falso alerta; desconto registrado que não aparece na nota é sinalizado. Descontos sem item identificado são considerados no total e pedem revisão.
- **Leitura incompleta nunca resulta em verde.**
- As cores indicam nível de atenção, não confirmação de erro. Diferenças não são apresentadas como “dinheiro economizado”.

## QR Code da NFC-e

O app lê o QR Code da NFC-e (versões 1, 2 e 3 do formato) e extrai **apenas o que está no próprio QR**:

- chave de acesso (validada pelo dígito verificador), de onde saem UF, mês/ano, CNPJ do emitente, modelo, série e número;
- valor total, **somente** em emissões em contingência (offline) ou no formato v1 — usado para checar o total lido da foto;
- a URL do portal da SEFAZ, que pode ser aberta no navegador (apenas domínios `.gov.br`).

**Limitações:** a lista de produtos não está no QR Code. Ela só aparece no portal de cada SEFAZ, cujo formato, disponibilidade e mecanismos anti-robô variam por estado. O app **não** faz raspagem desses portais nem contorna controles de acesso; por isso a leitura por foto continua sendo o caminho principal. A integração com dados completos exigiria uma API oficial ou autorizada por estado.

## Privacidade e segurança

- Sem conta, todos os dados ficam no aparelho.
- Com conta: RLS em todas as tabelas (`user_id = auth.uid()`), `user_id` imposto por gatilho (o valor enviado pelo cliente é ignorado), chaves estrangeiras compostas impedem vincular dados a registros de outro usuário, e um gatilho impede que uma versão antiga sobrescreva uma mais nova na sincronização.
- Sessão salva no Keychain/Keystore (expo-secure-store, em partes).
- Fotos de cupom são apagadas do aparelho após a leitura (ou ao sair da tela) e não são armazenadas no servidor. O envio ao OCR exige consentimento explícito, revogável.
- Exclusão: compra individual, todos os dados do aparelho, ou conta + dados da nuvem (`delete_my_account`).
- Política de privacidade no app (`src/app/privacy.tsx`), preparada para revisão jurídica antes da publicação.

## Estado dos testes

| Tipo | Situação |
|---|---|
| **Automatizados — regras de negócio e persistência (Jest)** | 82 testes (73 do app de conferência + 9 do marketplace: distância, prévia de proximidade, permissão de localização, indicadores separados, desconto só comprovado, datas, validação das etapas, imagens), todos passando. Cobrem os 20 itens exigidos (adição/remoção/quantidade, repetição técnica, compra intencional de 2 unidades, subtotais, total, arredondamento, peso, descontos, leitura incompleta, quantidade/preço diferentes, ausentes no carrinho/na nota, descrições diferentes, recuperação após fechar o app, offline/sincronização, permissão da câmera) e os 5 exemplos do enunciado. |
| **Automatizados — banco (PGlite + migração real)** | 8 testes, todos passando: isolamento entre usuários, `user_id` forjado, sobrescrita/exclusão de dados alheios, vínculo a compra de outro usuário, conflito de versão, restrições de valores, exclusão de conta. |
| **Compilação** | `tsc` sem erros; ESLint sem avisos; bundles Hermes de Android e iOS gerados com `expo export`. |
| **Simulado (navegador)** | Build web executado no Chromium (390×844) com SQLite real: nova compra, digitação de código, cadastro de produto desconhecido, diálogo de leitura repetida, carrinho, cupom digitado, conferência (vermelho → amarelo após “Confirmar que comprei 3 un”). Sem câmera no ambiente. |
| **Marketplace — banco (PGlite + migração real)** | 31 testes, todos passando, cobrindo os 22 itens exigidos: publicação, fotos (vazia, formato, caminho, limite de 5, evidência obrigatória), seleção e sugestão de estabelecimento/unidade, GPS dentro/fora do raio, baixa precisão, sem localização e leitura antiga, publicação manual em análise, consultas por cidade/distância/categoria/supermercado/preço, mapa por unidade, expiração e retenção, confirmação comunitária (contas novas não contam, sem auto-confirmação, sem repetição), denúncias e contestação, moderação e registro, duplicidade, coordenadas privadas, permissões administrativas, RLS, limites diários, notificações e reputação. |
| **Contrato app × banco** | 3 testes: todas as funções e parâmetros usados por `src/services/marketplace.ts` existem no banco; todos os campos enviados são lidos; colunas das tabelas acessadas existem. |
| **Ponta a ponta (navegador)** | `npm run test:e2e`: app web real + servidor local que imita o Supabase sobre o PostgreSQL real. 11 passos passando: visitante sem ofertas, publicação com foto/recorte/GPS compatível, GPS longe (análise), outra pessoa vê com indicadores separados, confirmação, favoritar e denunciar, duplicidade desviada, moderação (denúncia, foto, aprovação), mapa por unidade, nenhuma coordenada gravada, expiração. Câmera e GPS simulados pelo Chromium. |
| **Orçamento, preços e gastos — Jest** | 30 testes novos (112 no total), todos passando: faixas exatas de 75/85/100%, limites configuráveis, alerta só ao subir de faixa, carrinho com quantidade/peso/desconto, resumo mensal, série por mês, gasto por supermercado, economia, comparação de compras, preço antigo fora da comparação, normalização da leitura por foto, persistência do orçamento, migração do banco local da versão anterior. |
| **Orçamento, preços e gastos — banco** | 12 testes novos (55 no total), todos passando: isolamento das compras/orçamento entre usuários, restrições, base compartilhada acessível só por funções, sem identificação de quem informou, idempotência, limite diário, dados inválidos, unidade não aprovada, preço antigo, exclusão de conta, contrato app × banco. |
| **Orçamento, preços e gastos — ponta a ponta** | 11 passos novos em `npm run test:e2e` (22 no total), todos passando: orçamento ao iniciar, saldo a cada item, avisos em 80%, 100% e 120%, sem aviso ao diminuir, unidade cadastrada, foto → formulário de conferência, Minhas compras, resumo, envio à base da comunidade, isolamento entre contas. **A leitura por IA é simulada** pelo servidor de teste (resposta fixa no formato da função real). |
| **Telas de conta — Jest** | 9 testes novos (124 no total), todos passando: validação de e-mail, exigências da senha, força (comprimento × variedade, plural do aviso) e tradução das mensagens do servidor, inclusive o tempo de espera informado pelo próprio servidor e a recusa em inventar tradução para mensagem desconhecida. |
| **Telas de conta — ponta a ponta** | 10 passos novos em `npm run test:e2e` (32 no total), todos passando: senha errada com recado em português, e-mail inválido barrado antes de chamar o servidor, "manter conectado" guardando a sessão no armazenamento duradouro, sem ele a sessão ficando só na aba, cadastro levando à confirmação e gravando o usuário, senhas diferentes e aceite faltando, e-mail já cadastrado, cadastro sem confirmação entrando direto, recuperação sem revelar se a conta existe, mostrar/ocultar senha. |
| **Telas de conta — acessibilidade (navegador)** | Conferido no app web real: 19 pares de cor em WCAG 2.1 AA (o menor é 3,33:1 em elemento não textual, mínimo 3), 7 alvos de toque com 44 px ou mais, foco visível (borda azul) e ordem de foco previsível, erros anunciados por `role="alert"`, nenhum elemento interativo sem nome e nenhuma rolagem horizontal com zoom de 200%. **Não testado:** leitor de tela real (VoiceOver/NVDA/TalkBack). |
| **Supabase real (projeto `meucarrin`)** | 10 verificações contra o servidor de produção, todas passando, com uma conta de teste criada e apagada em seguida: cadastro devolvendo sessão, gatilho criando o perfil, cadastro repetido recusado (HTTP 422), login certo, login com senha errada recusado, senha curta recusada, RLS negando leitura sem sessão (42501) e devolvendo apenas os dados da própria conta, login anônimo recusado (`anonymous_provider_disabled`) e a conta de teste removida. Migrações conferidas por contagem: 30 tabelas, 30 com RLS, 60 políticas, 58 funções, 25 gatilhos, 1 bucket e 4 tarefas no `pg_cron`. |
| **Busca de endereço no cadastro de unidade** | Exercitada no app web real contra o serviço de mapas de verdade: a busca por "Avenida da Orla, Bertioga" devolve resultados, escolher um preenche endereço, bairro, cidade e UF e crava o ponto em Bertioga (−23,79648, −46,01454), e um texto sem resultado mostra o aviso em vez de ficar em silêncio. Mais 8 testes Jest sobre os limites do Brasil e a leitura do resultado (137 no total). |
| **Edge Functions** | `receipt-ocr` e `send-push`: tipagem verificada (a parte nova de leitura de produto por foto segue o mesmo padrão de chamada, mas não foi verificada nem executada) contra `@anthropic-ai/sdk@1.3.0` e `@supabase/supabase-js`. **Não executada**: não há projeto Supabase nem chaves de API neste ambiente. |
| **Landing page (navegador + runtime do Cloudflare)** | `npm run check:site`: imagens, links, âncoras, um `h1`, textos alternativos, idioma, Open Graph, dados estruturados, marcadores do build e rolagem lateral em 360 px — tudo passando. Com `wrangler dev` (workerd): cabeçalhos de segurança, `/termos` e `/privacidade` sem redirecionamento, 404 com status 404, cache dos arquivos e `_headers` não exposto. Sem erros de console no Chromium. **Não testado:** deploy real, domínio próprio e Safari do iPhone. |
| **Planos e assinatura — Jest** | 13 testes novos (150 no total), todos passando: leitura do estado vindo do servidor (inclusive campo inesperado caindo para o plano grátis, nunca o contrário), frases de renovação, cancelamento agendado, cartão recusado e assinatura encerrada, uso do mês por balde, barra que não passa do fim, plano sem limite e economia do anual. |
| **Planos e assinatura — banco (PGlite + migração real)** | 13 testes novos (73 no total), todos passando: plano grátis por omissão, cada tipo de leitura no seu balde (foto de produto conta como etiqueta), cota que não fica negativa, leitura do mês passado fora da conta, balde único de 300 no Mais, atraso de cobrança valendo três dias e não mais, cancelamento voltando ao grátis, tipo de leitura inválido recusado, ninguém virando assinante pelo aplicativo (inserção barrada pela RLS; alteração e exclusão sem efeito) e ninguém esvaziando tabela com TRUNCATE. O banco de teste passou a imitar o privilégio padrão do Supabase — foi isso que revelou o TRUNCATE aberto em produção. |
| **Planos e assinatura — ponta a ponta** | 9 passos novos em `npm run test:e2e` (41 no total), todos passando, no app web real: plano grátis com cota zerada, cota mostrando 5 de 20 fotos e 1 de 4 cupons, cota esgotada dizendo o número, mensal e anual com os preços certos e a economia do anual, assinatura ativa no banco virando plano Mais com cota única de 300, cancelamento agendado com a data, cobrança atrasada pedindo o cartão sem cortar o plano, cancelada voltando ao grátis, e o caminho pelo perfil. **Nenhum pagamento é feito**: o que se verifica é a tela a partir do estado do banco. |
| **Assinatura — funções da borda (Deno)** | 7 testes em `supabase/functions/_shared/stripe.test.ts`, todos passando no Deno 2.9.6: aviso com assinatura correta aceito, assinatura de outro segredo recusada, corpo alterado depois de assinado recusado, aviso velho recusado pela tolerância de tempo, id da assinatura achado em cada forma de aviso (inclusive fatura nova com `parent.subscription_details`), fim do período lido no item ou no objeto conforme a versão da API, e preço desconhecido não virando plano. |
| **Stripe real (conta de produção)** | Conferido contra a conta brasileira: preço achado por `lookup_key`, sessão de pagamento criada com exatamente os parâmetros da função (R$ 9,90, moeda BRL, `payment_method_types` resolvido para `['card']` pela própria Stripe em modo assinatura) e endereço de pagamento devolvido. O cliente e a sessão de prova foram **apagados** em seguida. Depois da publicação: webhook recusando chamada sem assinatura e com assinatura inventada, checkout recusando chamada sem sessão. **Não testado:** pagamento de verdade de ponta a ponta — exige a chave de teste (`sk_test_`) no lugar da de produção, e o cofre guarda uma por serviço. |
| **Pagamento com a Stripe de teste** | `e2e/pagamento-stripe.mjs`, 6 passos, todos passando, com as **funções reais** rodando sob Deno contra o PostgreSQL do arranjo de teste e a Stripe de teste: assinatura criada e cobrada (R$ 9,90, em reais, fatura gerada); aviso real da Stripe com assinatura adulterada **recusado** sem liberar plano; o mesmo aviso, assinado corretamente, liberando o plano Mais no espelho; aviso repetido e fatura paga fora de ordem sem causar dano (uma linha só); cancelamento agendado mantendo o plano e marcando que não renova; cancelamento efetivado devolvendo a pessoa ao plano grátis. Conferido também pela função `my_plan`: cota de 300 enquanto assinante, 20 e 4 depois do cancelamento. O cliente de teste foi apagado ao final. |
| **Cota no servidor, exercitada de verdade** | Função `receipt-ocr` rodando aqui: com cota disponível ela segue para a IA (502 por não haver chave neste ambiente, que é o esperado); com os 4 cupons do mês gastos, devolve **429** com a mensagem do plano **sem chamar a IA**; a etiqueta, que tem balde próprio, continua passando; e com o plano Mais ativo o mesmo cupom volta a passar. |
| **Página de pagamento e portal (navegador)** | Abertos no Chromium: o checkout mostra "Assinar Meu Carrin Mais · R$ 9,90 por mês" com o formulário de cartão em português, e o portal mostra plano, próxima cobrança (23/12/2026), o cartão Visa •••• 4242 e o botão de cancelar. **Não testado:** o clique final de pagar e o de confirmar o cancelamento — a Stripe roda uma verificação antibô (hCaptcha) em endereços de subdomínio sorteado, que esta rede não libera, e desativar a detecção de automação seria burlar essa proteção. São telas da própria Stripe; o que depende do nosso código foi provado pela via da API, que produz os mesmos objetos e avisos. |
| **Plano IA e assistente — Jest** | 13 testes novos (163 no total), todos passando: o plano IA lido do servidor com o uso do assistente, a ordem dos planos pagos, a chave do preço montada a partir do plano e do período, o IA ainda marcado como indisponível, e a leitura do que a IA entendeu — grama e mililitro virando quilo e litro, pacote com peso indo para a observação, quantidade não dita continuando não dita (não vira 1), item sem nome descartado, unidade desconhecida sem conversão inventada e a lista com teto de 30 itens. |
| **Plano IA — banco** | 4 testes novos (76 no total), todos passando: o assistente só existe no plano IA (o balde `voz` é zero nos outros, e é ele que recusa), a conversa consumindo o balde de voz e o total de 600, e a tela de planos mostrando o uso do assistente. |
| **Assistente — não exercitado com áudio** | A função `assistente` tem tipagem verificada e está publicada, mas **nunca rodou com áudio de verdade**: falta a chave da Claude (que não pode ser guardada no cofre desta sessão) e a conta da OpenAI está **sem créditos** (`insufficient_quota`). Sem isso não há transcrição nem entendimento, e por isso o plano IA está marcado como indisponível. |
| **Passo instável conhecido** | `avisa ao passar de 75%, ao atingir 100% e ao ultrapassar`, no roteiro do orçamento, depende de o aviso aparecer logo após o toque em "+". Em 22/11/2026 ele passou 3 vezes e falhou 2 no mesmo código, sempre com a máquina ocupada; sozinho e com a máquina livre, passou 4 vezes seguidas. A espera foi de 10 s para 20 s, como no resto do roteiro. **Não é defeito do aplicativo**: quando falha, é o aviso demorando mais que a espera do teste. Se voltar a falhar com frequência, o caminho é investigar a fila de verificação de orçamento no AppContext, não aumentar o tempo de novo.<br><br>**23/11/2026 — causa encontrada em outro passo.** O passo `compra encerrada fica em Minhas compras` passou a falhar em 5 de 8 rodadas depois que o pacote cresceu (assistente e plano IA). Não era carga nem a tela nova: o roteiro **recarregava a página 1,5 s depois de encerrar**, antes de o aplicativo terminar de gravar, e o encerramento se perdia. Agora o teste espera o início mostrar "Nova compra" — isto é, confere o efeito em vez de correr com ele — e passou 3 de 3. Duas hipóteses minhas foram descartadas pelo caminho (carga da máquina e a tela nova), cada uma com uma rodada de controle.<br><br>**25/11/2026 — a explicação acima estava errada.** O passo voltou a falhar com a espera nova. Registros temporários mostraram a causa real: uma sincronização em andamento lia a compra ainda ativa, e gravava a cópia do servidor depois do encerramento, apagando-o. Isso acontecia com frequência porque a trava de "uma sincronização por vez" era marcada tarde, e até cinco rodavam juntas. Corrigido em `src/data/sync.ts` (trava marcada antes de qualquer espera; regra de quem vence conferida dentro do comando de gravação), com dois testes que falhavam antes. Ponta a ponta: 3 de 3 rodadas completas depois. Ao investigar apareceu também uma corrida real no `AppContext`: duas leituras do estado da compra podiam terminar fora de ordem e a mais antiga sobrescrevia a mais nova, devolvendo à tela uma compra já encerrada. Corrigido com um número de leitura (só a mais recente escreve na tela). |
| **Celular físico** | **Não realizado.** Leitura de código pela câmera, fotos, lanterna, armazenamento seguro e permissões nativas precisam ser verificados em aparelho real. |
| **Cupons reais** | **Não testado.** O parser foi validado apenas com textos fictícios em layouts típicos (NFC-e, duas linhas por item, ECF/SAT). |

## Limitações e problemas conhecidos

- **A CSP da landing bloqueava o próprio rastreador do Cloudflare.** O Web Analytics injeta
  `beacon.min.js` na resposta da página, e a política recusava: o site esteve no ar desde 15/11
  sem registrar uma única visita. Desde 21/11 o `scripts/build-site.mjs` libera
  `static.cloudflareinsights.com` no `script-src` e `cloudflareinsights.com` no `connect-src`.
- **Caminhos com `@` não funcionam no Cloudflare.** O Workers Static Assets devolve o
  `index.html` no lugar de um arquivo em pasta `@expo/` e entra em laço de redirecionamento com
  nomes como `icone@2x.png`. Os arquivos sobem no deploy, mas não são servidos — e o aplicativo
  publicado ficou **sem nenhum ícone** desde a primeira publicação, porque a fonte Ionicons mora
  em `assets/node_modules/@expo/...`. O `scripts/build-web.mjs` renomeia esses 25 caminhos para
  `_at_` depois do export e reescreve as referências nos arquivos gerados. Se um dia o Cloudflare
  passar a servir `@`, a renomeação continua inofensiva.
- **Testes em aparelho e com cupons reais pendentes** (ver acima). Layouts de cupom de algumas redes podem exigir ajustes no parser; linhas não reconhecidas aparecem na revisão para inclusão manual.
- `expo-doctor`: 18/20 verificações passaram; as 2 restantes dependem da API do Expo, inacessível neste ambiente — rode `npx expo-doctor` na sua máquina.
- Fotos de embalagem ficam só no aparelho (não sincronizam).
- Se o mesmo código de barras for cadastrado offline em dois aparelhos, a sincronização mantém os dois cadastros (o segundo sem o código) para não quebrar referências.
- O link de recuperação de senha volta para `/auth/nova-senha` dentro do app (na web pela sessão que vem no endereço; no celular pelo esquema `meucarrin://`). Isso exige que o **Site URL** e as **Redirect URLs** estejam configurados no Supabase — sem isso o link não volta para o aplicativo.
- Linhas canceladas no cupom (“ITEM 002 CANCELADO”) são desconsideradas com aviso; formatos de cancelamento muito diferentes podem não ser reconhecidos.
- A tolerância de peso para produtos pesados é de 5% antes de gerar alerta amarelo.
- Na web, confirmações nativas (`Alert`) não aparecem; a web não é um alvo de publicação, é usada apenas para testes visuais.
