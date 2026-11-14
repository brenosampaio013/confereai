# Confere Aí

Aplicativo para conferir compras de supermercado: registre os produtos enquanto compra, fotografe o cupom fiscal no caixa e veja possíveis cobranças duplicadas, diferenças de quantidade, de preço e itens não localizados.

> **Status:** aplicativo funcional, com testes automatizados executados. **Ainda não foi testado em um celular físico** nem com cupons fiscais reais (veja [Estado dos testes](#estado-dos-testes)).

---

## Sumário

1. [Funcionalidades](#funcionalidades)
2. [Tecnologias](#tecnologias)
3. [Arquitetura e pastas](#arquitetura-e-pastas)
4. [Como executar](#como-executar)
5. [Abrir no celular (câmera)](#abrir-no-celular)
6. [Publicar no Cloudflare](#publicar-no-cloudflare)
6. [Publicar na Netlify](#publicar-na-netlify)
7. [Marketplace de ofertas](#marketplace-colaborativo-de-ofertas)
7. [Configurar o Supabase](#configurar-o-supabase)
7. [Configurar o OCR / IA](#configurar-o-ocr--ia)
8. [Testes](#testes)
9. [Gerar versões (EAS)](#gerar-versões-eas)
10. [Regras de negócio importantes](#regras-de-negócio-importantes)
11. [QR Code da NFC-e: possibilidades e limites](#qr-code-da-nfc-e)
12. [Privacidade e segurança](#privacidade-e-segurança)
13. [Estado dos testes](#estado-dos-testes)
14. [Limitações e problemas conhecidos](#limitações-e-problemas-conhecidos)

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
    purchase/, product/, auth.tsx, privacy.tsx
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
  data/                Persistência
    schema.ts          Migrações SQLite locais
    repository.ts      Leitura/escrita, exclusão lógica, histórico de edições, fila de sincronização
    sync.ts            Envio/recebimento com o Supabase
    expoDriver.ts      Adaptador expo-sqlite
  services/            Integrações (Supabase, OCR, Open Food Facts, rede, conferência)
  state/               Contexto do app (compra ativa, sessão, sincronização)
  ui/                  Tema, logotipo e componentes reutilizáveis
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
cd confere-ai
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

Elas são usadas **durante o build**, então precisam estar nas variáveis de build, não nas de runtime. Cada push no `master` publica uma versão nova. No celular, abra o endereço no Chrome e use **Instalar app**.

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

## Configurar o Supabase

1. Crie um projeto em <https://supabase.com>.
2. Aplique as migrações de `supabase/migrations/` (as três, em ordem). Pelo CLI:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref SEU_PROJECT_REF
```

```bash
npx supabase db push
```

   (ou cole o SQL no *SQL Editor* do painel).
3. Em **Authentication → Providers → Email**, mantenha e-mail/senha habilitado. Para usar o OCR sem conta, habilite **Anonymous sign-ins** (Authentication → Sign In / Providers). Se ficar desabilitado, o OCR exige login.
4. Em **Authentication → URL Configuration**, defina a URL para onde o link de recuperação de senha leva (por exemplo, uma página web sua). O app envia o e-mail de recuperação; a troca da senha acontece nessa página.
5. Copie *Project URL* e *anon public key* (Settings → API) para o `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

A chave `anon` é pública; a proteção dos dados vem das políticas RLS. **Nunca** coloque a chave `service_role` no app.

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

A função exige sessão do Supabase, valida tamanho/quantidade de imagens (1–6, ~4,5 MB cada), aplica limite diário por usuário (`OCR_DAILY_LIMIT`, tabela `ocr_usage`) e não armazena imagens. Ambos os provedores são pagos conforme uso; consulte os preços de cada um.

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

Antes de produção: configure as variáveis `EXPO_PUBLIC_*` no EAS (`eas env:create`) ou no `.env`, revise `bundleIdentifier`/`package` em `app.json` (`br.com.confereai.app` é um valor sugerido), preencha o contato de privacidade e revise a política com assessoria jurídica. A publicação nas lojas exige contas Apple Developer / Google Play e etapas manuais (fichas, capturas de tela, classificação, formulário de segurança de dados); nada disso é automático.

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
| **Edge Functions** | `receipt-ocr` e `send-push`: tipagem verificada (a parte nova de leitura de produto por foto segue o mesmo padrão de chamada, mas não foi verificada nem executada) contra `@anthropic-ai/sdk@1.3.0` e `@supabase/supabase-js`. **Não executada**: não há projeto Supabase nem chaves de API neste ambiente. |
| **Celular físico** | **Não realizado.** Leitura de código pela câmera, fotos, lanterna, armazenamento seguro e permissões nativas precisam ser verificados em aparelho real. |
| **Cupons reais** | **Não testado.** O parser foi validado apenas com textos fictícios em layouts típicos (NFC-e, duas linhas por item, ECF/SAT). |

## Limitações e problemas conhecidos

- **Testes em aparelho e com cupons reais pendentes** (ver acima). Layouts de cupom de algumas redes podem exigir ajustes no parser; linhas não reconhecidas aparecem na revisão para inclusão manual.
- `expo-doctor`: 18/20 verificações passaram; as 2 restantes dependem da API do Expo, inacessível neste ambiente — rode `npx expo-doctor` na sua máquina.
- Fotos de embalagem ficam só no aparelho (não sincronizam).
- Se o mesmo código de barras for cadastrado offline em dois aparelhos, a sincronização mantém os dois cadastros (o segundo sem o código) para não quebrar referências.
- O link de recuperação de senha abre a página configurada no Supabase; não há tela de “nova senha” dentro do app.
- Linhas canceladas no cupom (“ITEM 002 CANCELADO”) são desconsideradas com aviso; formatos de cancelamento muito diferentes podem não ser reconhecidos.
- A tolerância de peso para produtos pesados é de 5% antes de gerar alerta amarelo.
- Na web, confirmações nativas (`Alert`) não aparecem; a web não é um alvo de publicação, é usada apenas para testes visuais.
