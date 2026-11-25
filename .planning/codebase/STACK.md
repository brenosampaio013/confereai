# Stack Tecnológica

**Data da análise:** 2026-11-25

## Linguagens

**Primária:**
- TypeScript ~6.0.3 - app (`src/`), testes (`__tests__/`), Edge Functions Deno (`supabase/functions/`)

**Secundária:**
- JavaScript/ESM (`.mjs`, `.js`) - scripts de build, e2e e testes de banco (`scripts/`, `e2e/`, `supabase/tests/`, `app.config.js`, `metro.config.js`, `jest.config.js`, `eslint.config.js`)
- SQL (PostgreSQL) - migrações em `supabase/migrations/` (schema, marketplace, orçamento/preços, waitlist, planos, privilégios, plano IA)
- HTML/CSS/JS - landing page estática em `site/`

## Runtime

**Ambiente:**
- Node.js 22 (`.node-version`; `NODE_VERSION = "22"` em `netlify.toml`; `node-version: 22` em `.github/workflows/deploy-web.yml`)
- Deno nas Edge Functions Supabase (`deno.lock`; imports `npm:` com versões fixas)
- React Native 0.88.1 (iOS/Android) e navegador (PWA via react-native-web)

**Gerenciador de pacotes:**
- npm (lockfile `package-lock.json` presente; `deno.lock` para as funções)

## Frameworks

**Núcleo:**
- Expo ~58.0.21 - plataforma do app (`app.json`, `app.config.js`); sempre instalar dependências com `npx expo install`
- Expo Router ~58.0.28 - navegação por arquivos em `src/app/` (`typedRoutes` ativo)
- React 19.3.0 / React DOM 19.3.0, React Compiler ativo (`experiments.reactCompiler` em `app.json`)
- react-native-web ~0.21.4 - versão web/PWA
- react-native-reanimated 4.7.1, react-native-worklets 0.13.0, react-native-gesture-handler ~3.3.0, react-native-screens ~4.30.0, react-native-safe-area-context ~5.10.1, react-native-svg 15.16.0
- maplibre-gl 6.15.0 - mapa de ofertas na web (`src/ui/market/OffersMap.web.tsx`)

**Testes:**
- Jest ^30.5.2 + jest-expo ~58 (`jest.config.js`, preset `jest-expo`, alias `@/` -> `src/`)
- `node --test` + @electric-sql/pglite ^0.5.13 - testes de SQL/RLS contra Postgres em memória (`supabase/tests/*.test.mjs`)
- Deno test nas funções (`supabase/functions/_shared/stripe.test.ts`)
- Playwright (não declarado em `package.json`; exigido por `e2e/run.mjs` e `scripts/capture-screens.mjs`)

**Build/Dev:**
- Metro (`metro.config.js`)
- ESLint ^9.39.5 + eslint-config-expo ^58 (`eslint.config.js`)
- Wrangler ^4.162.0 - deploy Cloudflare
- EAS Build/Submit (`eas.json`)
- Scripts de build: `scripts/build-web.mjs` (export web + manifesto PWA + service worker + `_headers`), `scripts/build-site.mjs`, `scripts/check-site.mjs`, `scripts/generate-icons.mjs`, `scripts/generate-store-art.mjs`, `scripts/generate-store-assets.mjs`

## Dependências-chave

**Críticas:**
- `@supabase/supabase-js` ^2.118.0 - auth, banco remoto, storage, RPC (`src/services/supabase.ts`)
- `expo-sqlite` ~58.0.14 - banco local offline-first (`src/data/expoDriver.ts`, `src/data/schema.ts`, `src/data/sync.ts`); na web exige SharedArrayBuffer (COOP/COEP)
- `expo-secure-store` ~58.0.2 - armazenamento da sessão (`src/services/secureStorage.ts`)
- `expo-camera`, `expo-image-picker`, `expo-image-manipulator` - leitura de código de barras, cupons e etiquetas
- `expo-audio`, `expo-speech` - assistente por voz
- `expo-location` - confirmação de proximidade em ofertas
- `expo-notifications` ~58.1.7 - push (`src/services/push.ts`)
- `@react-native-community/netinfo` 12.0.1 - estado de rede

**Infraestrutura (Edge Functions):**
- `npm:@anthropic-ai/sdk@1.3.0`, `npm:stripe@23.2.0`, `npm:@supabase/supabase-js@2.118.0`

## Configuração

**Ambiente:**
- Arquivo `.env` presente (não lido); modelo em `.env.example`
- Variáveis públicas do app (embutidas no bundle): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_OPEN_FOOD_FACTS`, `EXPO_PUBLIC_PRIVACY_CONTACT`, `EXPO_PUBLIC_WEB_URL`
- Variáveis de build: `EXPO_BASE_URL` (caminho base, ex.: GitHub Pages), `SITE_URL`, `SITE_APP_URL`
- Leitura e fallback em `src/lib/config.ts`; sem as variáveis o app funciona 100% local
- Segredos das Edge Functions em `supabase/functions/.env` (não lido) / `supabase secrets set`

**Build:**
- `app.json` (nome "Meu Carrin", slug `meu-carrin`, scheme `meucarrin`, bundle/package `com.meucarrin.app`, plugins e permissões), `app.config.js`
- `eas.json` (perfis `development`, `preview`, `production`; `appVersionSource: remote`)
- `tsconfig.json`, `__tests__/tsconfig`
- `supabase/config.toml` (auth com e-mail/senha, sem confirmação, senha mínima 8; `verify_jwt` por função)
- `wrangler.jsonc` (Worker do app, `dist/`) e `wrangler.site.jsonc` (Worker da landing, `site-dist/`)
- `netlify.toml` (build web + cabeçalhos COOP/COEP)

## Requisitos de plataforma

**Desenvolvimento:**
- Node 22, npm, Expo CLI; development build (`expo-dev-client`) para módulos nativos; Supabase CLI e Deno para funções; Playwright + Chromium para e2e
- Comandos: `npm test`, `npm run test:db`, `npm run test:all`, `npm run typecheck`, `npm run lint`, `npm run test:e2e`

**Produção:**
- App nativo: Android (AAB via EAS, envio ao Google Play na faixa internal, chave `google-play-service-account.json` presente, não lida) e iOS
- Web/PWA: Cloudflare Workers (static assets), GitHub Pages ou Netlify
- Backend: Supabase (Postgres, Auth, Storage, Edge Functions)

---

*Análise da stack: 2026-11-25*
