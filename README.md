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
6. [Configurar o Supabase](#configurar-o-supabase)
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

## Configurar o Supabase

1. Crie um projeto em <https://supabase.com>.
2. Aplique a migração (`supabase/migrations/20261030120000_initial_schema.sql`). Pelo CLI:

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

A leitura de cupons e etiquetas passa pela Edge Function `receipt-ocr`, que devolve **somente o texto transcrito**. A interpretação dos valores é feita pelo parser determinístico do app.

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
| **Automatizados — regras de negócio e persistência (Jest)** | 73 testes, todos passando. Cobrem os 20 itens exigidos (adição/remoção/quantidade, repetição técnica, compra intencional de 2 unidades, subtotais, total, arredondamento, peso, descontos, leitura incompleta, quantidade/preço diferentes, ausentes no carrinho/na nota, descrições diferentes, recuperação após fechar o app, offline/sincronização, permissão da câmera) e os 5 exemplos do enunciado. |
| **Automatizados — banco (PGlite + migração real)** | 8 testes, todos passando: isolamento entre usuários, `user_id` forjado, sobrescrita/exclusão de dados alheios, vínculo a compra de outro usuário, conflito de versão, restrições de valores, exclusão de conta. |
| **Compilação** | `tsc` sem erros; ESLint sem avisos; bundles Hermes de Android e iOS gerados com `expo export`. |
| **Simulado (navegador)** | Build web executado no Chromium (390×844) com SQLite real: nova compra, digitação de código, cadastro de produto desconhecido, diálogo de leitura repetida, carrinho, cupom digitado, conferência (vermelho → amarelo após “Confirmar que comprei 3 un”). Sem câmera no ambiente. |
| **Edge Function** | Tipagem verificada contra `@anthropic-ai/sdk@1.3.0` e `@supabase/supabase-js`. **Não executada**: não há projeto Supabase nem chaves de API neste ambiente. |
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
