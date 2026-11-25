<!-- refreshed: 2026-11-25 -->
# Arquitetura

**Data da análise:** 2026-11-25

## Visão geral do sistema

```text
┌─────────────────────────────────────────────────────────────────┐
│                    Interface (Expo Router)                       │
├──────────────────┬──────────────────┬───────────────────────────┤
│  Rotas / telas   │  Telas reutiliz. │  Componentes de UI        │
│  `src/app/`      │  `src/screens/`  │  `src/ui/`                │
└────────┬─────────┴────────┬─────────┴──────────┬────────────────┘
         │                  │                     │
         ▼                  ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│  Estado global: `src/state/AppContext.tsx` (useApp: repo,       │
│  carrinho, orçamento, sync) + `src/state/handoff.ts`            │
└────────┬───────────────────────────────┬────────────────────────┘
         ▼                               ▼
┌──────────────────────┐   ┌─────────────────────────────────────┐
│ Dados locais         │   │ Serviços (rede / dispositivo)        │
│ `src/data/`          │   │ `src/services/`                      │
│ Repository + SQLite  │   │ supabase, ocr, marketplace, planos…  │
│ SyncService          │   │                                      │
└────────┬─────────────┘   └──────────────┬──────────────────────┘
         │      Domínio puro `src/domain/` (sem I/O)│
         ▼                                 ▼
┌──────────────────────┐   ┌─────────────────────────────────────┐
│ SQLite no aparelho   │   │ Supabase: Postgres+RLS+RPC, Auth,   │
│ `confere-ai.db`      │   │ Edge Functions `supabase/functions/`│
└──────────────────────┘   └─────────────────────────────────────┘
```

## Responsabilidades dos componentes

| Componente | Responsabilidade | Arquivo |
|-----------|------------------|---------|
| Layout raiz | Providers, Stack de navegação, splash | `src/app/_layout.tsx` |
| Abas | Navegação principal (início, compras, scan, ofertas, perfil) | `src/app/(tabs)/_layout.tsx` |
| AppProvider / `useApp` | Abre SQLite, migra, cria Repository e SyncService, mantém compra ativa, carrinho, orçamento, sessão | `src/state/AppContext.tsx` |
| Repository | Todo acesso SQL local (CRUD, relatórios, fila de sync) | `src/data/repository.ts` |
| SqlDriver | Interface mínima de SQL; implementada por expo-sqlite | `src/data/sql.ts`, `src/data/expoDriver.ts` |
| Schema local | Migrações SQLite versionadas e lista `SYNCED_TABLES` | `src/data/schema.ts` |
| SyncService | Sincronização local ⇄ nuvem (upsert idempotente, pull incremental) | `src/data/sync.ts` |
| RemoteAdapter Supabase | Implementa `RemoteAdapter` com paginação por `updated_at` | `src/services/remoteAdapter.ts` |
| Reconciliação | Compara carrinho x cupom fiscal e gera relatório | `src/domain/reconciliation.ts` |
| Parser de cupom | Texto OCR -> cupom estruturado | `src/domain/receiptParser.ts` |
| Marketplace (domínio) | Regras de promoções/ofertas | `src/domain/marketplace.ts` |
| Edge Functions | OCR, assistente de voz, Stripe, push | `supabase/functions/*/index.ts` |

## Visão do padrão

**Geral:** App cliente "offline-first" em camadas (UI -> estado -> dados/serviços -> domínio puro), com backend serverless Supabase.

**Características principais:**
- Fonte de verdade local: SQLite no aparelho; a nuvem é cópia sincronizada (só para contas não anônimas).
- Regras de negócio em funções puras em `src/domain/` (testáveis sem React nem banco).
- Regras sensíveis do marketplace/planos validadas no servidor via funções SQL (RPC) e RLS; o cliente apenas chama e traduz erros.
- Chaves de IA/pagamento ficam só nas Edge Functions; o app só conhece URL e anon key públicas (`src/lib/config.ts`).
- Mesmo código roda em Android, iOS e web (PWA); variantes por plataforma via sufixo `.web.tsx` (`src/ui/market/OffersMap.web.tsx`).

## Camadas

**Rotas/UI:**
- Propósito: telas e navegação baseada em arquivos.
- Local: `src/app/`, `src/screens/`, `src/ui/`
- Depende de: `src/state`, `src/services`, `src/domain`, `src/lib`
- Usado por: Expo Router (entrada `expo-router/entry`)

**Estado:**
- Local: `src/state/AppContext.tsx`, `src/state/handoff.ts`
- Contém: contexto global, `version` + `bump()` para recarga, passagem de resultados entre telas via Map (`handoff`).
- Depende de: `src/data`, `src/services`, `src/domain`

**Dados:**
- Local: `src/data/`
- Depende de: `src/domain` (tipos e cálculos). Não importa React.

**Serviços:**
- Local: `src/services/`
- Contém: clientes Supabase/Edge Functions (`ocr.ts`, `assistente.ts`, `marketplace.ts`, `planos.ts`, `prices.ts`, `auth.ts`), dispositivo (`location.ts`, `push.ts`, `network.ts`, `secureStorage.ts`) e orquestração (`conference.ts`).

**Domínio:**
- Local: `src/domain/`
- Contém: tipos (`types.ts`), dinheiro em centavos (`money.ts`), unidades, orçamento, carrinho, parsers, reconciliação, regras de planos/marketplace.
- Depende de: nada fora de si.

**Utilitários:** `src/lib/` (config, dialog, format, id, permissions, `useLoad`).

## Fluxo de dados

### Fluxo principal: carrinho e conferência

1. Tela adiciona item (`src/app/item/add.tsx`, `src/app/scan.tsx`) e chama `repo` obtido de `useApp()`.
2. `Repository` grava no SQLite (`src/data/repository.ts`) e a tela chama `bump()`.
3. `bump()` incrementa `version`, recarrega compra ativa/carrinho/orçamento (`refreshActive`) e agenda `syncNow` em 4 s (`src/state/AppContext.tsx`).
4. Foto do cupom -> `src/services/ocr.ts` -> Edge Function `receipt-ocr` -> `parseReceipt` (`src/domain/receiptParser.ts`) -> revisão em `src/app/receipt/[id].tsx`.
5. `runConference` (`src/services/conference.ts`) chama `reconcile` e salva relatório; resultado em `src/app/report/[id].tsx`.

### Sincronização

1. `SyncService.sync()` só roda online e com conta não anônima.
2. Envia linhas pendentes (upsert por id, exclusão lógica `deleted_at`), limpa fila após confirmação.
3. Puxa alterações por `updated_at`; conflito vence o mais recente (gatilho no servidor).
4. Se `pulled > 0`, incrementa `version` para recarregar as telas.

### Marketplace / planos / assistente

Tela -> `src/services/marketplace.ts` / `planos.ts` / `assistente.ts` -> RPC ou Edge Function Supabase -> regras e cotas validadas no servidor (`supabase/migrations/`).

**Gerenciamento de estado:**
- Global: `AppContext` (um único `AppProvider`); telas usam `useLoad` (`src/lib/useLoad.ts`) para carregar dados no foco, dependendo de `version`.
- Local: `useState` nas telas.

## Abstrações-chave

**SqlDriver:** interface em `src/data/sql.ts`; `ExpoSqliteDriver` no app e driver `node:sqlite` nos testes (`__tests__/nodeSqliteDriver.ts`).
**RemoteAdapter:** interface em `src/data/sync.ts`; permite testar sync sem rede.
**Clock / newId:** injetados no `Repository` (`systemClock`, `newId` de `src/lib/id.ts`) para determinismo em testes.
**Erros tipados:** `OcrError`, `MarketplaceError` com `reason` (`src/services/ocr.ts`, `src/services/marketplace.ts`).

## Pontos de entrada

**App:** `src/app/_layout.tsx` (`main: expo-router/entry` em `package.json`).
**Rotas:** todo arquivo em `src/app/` (ex.: `src/app/(tabs)/index.tsx`).
**Edge Functions:** `supabase/functions/{assistente,receipt-ocr,send-push,stripe-checkout,stripe-portal,stripe-webhook}/index.ts`.
**Build web:** `scripts/build-web.mjs` (PWA em `dist/`); site de marketing `scripts/build-site.mjs` (`site/` -> `site-dist/`).

## Restrições arquiteturais

- **Threading:** JS single-thread; SQLite assíncrono via expo-sqlite. Transações aninhadas usam SAVEPOINT (`src/data/expoDriver.ts`).
- **Estado global de módulo:** `syncTimer`, `budgetCheck`, `leituraAtual` em `src/state/AppContext.tsx` (assume um único AppProvider); Maps em `src/state/handoff.ts`; cliente singleton em `src/services/supabase.ts`.
- **Web:** exige isolamento COOP/COEP para SQLite/SharedArrayBuffer (`metro.config.js`, `netlify.toml`, `_headers` gerado por `scripts/build-web.mjs`, service worker).
- **Sem servidor próprio:** hospedagem apenas estática (`wrangler.jsonc`, `netlify.toml`, `.github/workflows/deploy-web.yml`).
- **Condição de corrida:** `refreshActive` descarta leituras antigas via contador `leituraAtual`.

## Anti-padrões

### Dados grandes na URL entre telas
**O que acontece:** evitado de propósito. **Faça assim:** use `handoff` (`src/state/handoff.ts`) para leituras de etiqueta/foto.

### Acesso SQL fora do Repository
**Por que é errado:** quebra a fila de sync e os testes com driver Node. **Faça assim:** adicione métodos em `src/data/repository.ts`.

### Segredos no cliente
**Faça assim:** chaves de OCR/IA/Stripe somente em segredos das Edge Functions; nunca `service_role` em `src/`.

### Regra de negócio dentro de componentes
**Faça assim:** coloque em `src/domain/` como função pura e teste em `__tests__/domain/`.

## Tratamento de erros

**Estratégia:** erros tipados nos serviços com `reason`; telas mostram `Banner`/`showAlert` (`src/lib/dialog.ts`, `src/ui/components.tsx`). Falha de inicialização fica em `error` do `AppProvider`. Sync devolve `SyncResult` com `skipped`/`error` em vez de lançar.

## Preocupações transversais

**Log:** sem framework; `console` pontual.
**Validação:** domínio (parsers/normalizadores) no cliente; autoridade final no Postgres (CHECKs, RLS, RPC).
**Autenticação:** Supabase Auth com sessão em SecureStore (`src/services/secureStorage.ts`); sessões anônimas só para OCR; rotas em `src/app/auth/`.
**Monetização:** planos/cotas em `src/domain/planos.ts`, `src/services/planos.ts`, Stripe nas Edge Functions.

---

*Análise de arquitetura: 2026-11-25*
