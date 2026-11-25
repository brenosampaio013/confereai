# Estrutura do Código

**Data da análise:** 2026-11-25

## Layout de diretórios

```
confere-ai/
├── src/
│   ├── app/            # Rotas Expo Router (cada arquivo = tela)
│   │   ├── (tabs)/     # Abas: index, purchases, scan-tab, offers, profile
│   │   ├── auth/       # Login, criar conta, recuperar, nova senha, confirmar
│   │   ├── offers/     # Publicar, minhas, avisos, [id], store/[id]
│   │   ├── admin/      # Moderação
│   │   ├── item/ product/ purchase/ receipt/ report/   # Fluxo de compra e conferência
│   │   └── scan, label, capture, compare, prices, planos, assistente, privacy
│   ├── screens/        # Telas grandes reutilizadas pelas abas (Cart, History, Summary)
│   ├── ui/             # Componentes visuais e tema
│   │   └── market/     # Componentes do marketplace (mapa, cards, cropper)
│   ├── state/          # AppContext (estado global) e handoff
│   ├── data/           # SQLite local: repository, schema, sync, drivers
│   ├── services/       # Supabase, Edge Functions, dispositivo
│   ├── domain/         # Regras puras e tipos
│   ├── lib/            # Utilitários (config, format, id, useLoad…)
│   └── types/          # Declarações (css.d.ts)
├── supabase/
│   ├── migrations/     # SQL do Postgres (schema, RLS, RPC)
│   ├── functions/      # Edge Functions (Deno) + `_shared/`
│   ├── tests/          # Testes de banco (PGlite, node:test)
│   └── config.toml
├── __tests__/          # Testes Jest (data, domain, lib, fixtures)
├── e2e/                # Testes E2E em Node com fake Supabase
├── scripts/            # Build web/site, ícones, artes de loja, capturas
├── site/               # Site de divulgação estático (-> site-dist)
├── docs/               # privacidade.html
├── assets/images/      # Ícones e imagens do app
├── store/android/      # Material da loja (screenshots)
├── motion-pro/         # Projeto do vídeo publicitário (não faz parte do app)
├── .github/workflows/  # deploy-web.yml (GitHub Pages)
├── .planning/codebase/ # Documentos de mapeamento
├── app.config.js, app.json, eas.json
├── metro.config.js, jest.config.js, eslint.config.js, tsconfig.json
├── netlify.toml, wrangler.jsonc, wrangler.site.jsonc
└── package.json
```

`dist/`, `site-dist/`, `e2e-output/`, `.wrangler/`, `.expo/` são gerados/locais. Não existem `ios/` nem `android/` (Continuous Native Generation).

## Propósito dos diretórios

**`src/app/`:** somente rotas e `_layout.tsx`; telas novas devem ser registradas em `src/app/_layout.tsx` (`Stack.Screen`) com título. Sem código não-rota aqui (regra em `AGENTS.md`).
**`src/domain/`:** funções puras, sem import de React/Expo/Supabase. Arquivos: `reconciliation.ts`, `receiptParser.ts`, `labelParser.ts`, `matching.ts`, `money.ts`, `units.ts`, `cart.ts`, `budget.ts`, `finance.ts`, `fiscal.ts`, `priceHistory.ts`, `productCapture.ts`, `scanGuard.ts`, `marketplace.ts`, `planos.ts`, `assistente.ts`, `auth.ts`, `endereco.ts`, `types.ts`.
**`src/data/`:** `repository.ts` (~940 linhas, todo SQL), `schema.ts` (`LOCAL_MIGRATIONS`, `SYNCED_TABLES`), `sync.ts`, `sql.ts`, `expoDriver.ts`.
**`src/services/`:** um arquivo por integração: `supabase.ts`, `remoteAdapter.ts`, `ocr.ts`, `assistente.ts`, `marketplace.ts`, `planos.ts`, `prices.ts`, `productLookup.ts`, `auth.ts`, `geocode.ts`, `location.ts`, `network.ts`, `push.ts`, `secureStorage.ts`, `conference.ts`.
**`src/ui/`:** `components.tsx` (Screen, Button, Banner, T, Sheet, Loading), `soft.tsx`, `theme.ts` (cores), `charts.tsx`, `Budget.tsx`, `PurchaseRow.tsx`, `StoreSheet.tsx`, `OcrConsent.tsx`, `account.tsx`, `Logo.tsx`, `RemoteImage.tsx`.
**`supabase/functions/`:** uma pasta por função com `index.ts`; código compartilhado em `_shared/stripe.ts` (teste `stripe.test.ts`).

## Localização de arquivos-chave

**Entrada:**
- `src/app/_layout.tsx`: raiz (SafeAreaProvider, AppProvider, Stack)
- `src/app/(tabs)/_layout.tsx`: barra de abas

**Configuração:**
- `app.config.js`, `app.json`, `eas.json`: Expo/EAS
- `src/lib/config.ts`: URL e anon key públicas do Supabase (com override `EXPO_PUBLIC_*`)
- `tsconfig.json`: alias `@/*` -> `src/*`
- `supabase/config.toml`: Supabase local
- `.env.example`: modelo de variáveis (não ler `.env`)

**Lógica central:**
- `src/state/AppContext.tsx`, `src/data/repository.ts`, `src/data/sync.ts`, `src/domain/reconciliation.ts`

**Testes:**
- `__tests__/domain/*.test.ts`, `__tests__/data/repository.test.ts`, `__tests__/lib/config.test.ts`
- `supabase/tests/*.test.mjs` (RLS, contrato, marketplace, planos, preços, waitlist)
- `e2e/*.e2e.mjs` rodados por `e2e/run.mjs`

## Convenções de nomes

**Arquivos:**
- Rotas: minúsculas, kebab-case; dinâmicas `[id].tsx`; grupos `(tabs)`; `_layout.tsx`.
- Componentes: PascalCase (`OfferCard.tsx`, `CartScreen.tsx`); módulos de UI agregadores em minúsculas (`components.tsx`, `soft.tsx`).
- Domínio/serviços/dados: camelCase (`receiptParser.ts`, `remoteAdapter.ts`).
- Variante web: sufixo `.web.tsx` (`OffersMap.web.tsx`).
- Testes: `<módulo>.test.ts` em `__tests__/<camada>/`; E2E `*.e2e.mjs`.
- Migrações: `AAAAMMDDHHMMSS_nome.sql`.

**Diretórios:** minúsculas; nomes de domínio em português (`planos`, `assistente`, `endereco`) misturados com inglês técnico (`offers`, `receipt`).

**Código:** identificadores e comentários em português (comentários) com termos técnicos em inglês; valores monetários em centavos (`Cents`, `src/domain/money.ts`); colunas SQL em snake_case, tipos TS em camelCase.

## Onde adicionar código novo

**Nova tela:** `src/app/<nome>.tsx` + `Stack.Screen` em `src/app/_layout.tsx`; lógica de carga com `useLoad`; componentes em `src/ui/`.
**Nova regra de negócio:** `src/domain/<nome>.ts` (pura) + `__tests__/domain/<nome>.test.ts`.
**Nova consulta local / tabela:** método em `src/data/repository.ts`; nova migração acrescentada ao fim de `LOCAL_MIGRATIONS` em `src/data/schema.ts`; se sincronizada, incluir em `SYNCED_TABLES`, em `src/data/sync.ts` (colunas bool/json/local-only) e criar migração em `supabase/migrations/`.
**Nova integração/API:** `src/services/<nome>.ts` usando `getSupabase()`; função de servidor em `supabase/functions/<nome>/index.ts` com segredos só lá.
**Novo componente compartilhado:** `src/ui/`; específico de ofertas em `src/ui/market/`.
**Utilitário genérico:** `src/lib/`.
**Teste de banco servidor:** `supabase/tests/<tema>.test.mjs` usando `helpers.mjs`.

## Diretórios especiais

**`dist/`:** saída do `scripts/build-web.mjs`; gerado, não versionar.
**`site-dist/`:** saída de `scripts/build-site.mjs`; gerado.
**`e2e-output/`:** artefatos dos E2E; gerado.
**`.wrangler/`, `.expo/`:** estado local de ferramentas; gerado.
**`motion-pro/`:** produção de vídeo e cache; fora do app.
**`supabase/migrations/`:** versionado; ordem cronológica pelo prefixo.

---

*Análise de estrutura: 2026-11-25*
