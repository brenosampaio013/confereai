# Integrações Externas

**Data da análise:** 2026-11-25

## APIs e Serviços Externos

**IA / OCR (Edge Functions, chaves só nos segredos):**
- Anthropic Claude - transcrição de cupons/etiquetas (`supabase/functions/receipt-ocr/index.ts`) e interpretação de pedidos de voz (`supabase/functions/assistente/index.ts`)
  - SDK: `npm:@anthropic-ai/sdk@1.3.0`
  - Auth: `ANTHROPIC_API_KEY`; modelo via `ANTHROPIC_MODEL` (padrão `claude-opus-5-5`)
- Google Cloud Vision - provedor alternativo de OCR (`OCR_PROVIDER=google_vision`), `https://vision.googleapis.com/v1/images`
  - Auth: `GOOGLE_VISION_API_KEY`; seletor: `OCR_PROVIDER` (padrão `anthropic`)
- OpenAI - transcrição de áudio, `https://api.openai.com/v1/audio/transcriptions` (`supabase/functions/assistente/index.ts`)
  - Auth: `OPENAI_API_KEY`; modelo via `OPENAI_STT_MODEL` (padrão `gpt-4o-mini-transcribe`)
- Cliente no app: `src/services/ocr.ts`, `src/services/assistente.ts`

**Pagamentos:**
- Stripe - assinaturas (checkout, portal do cliente, webhook)
  - SDK: `npm:stripe@23.2.0`
  - Funções: `supabase/functions/stripe-checkout`, `stripe-portal`, `stripe-webhook`; helpers em `supabase/functions/_shared/stripe.ts`
  - Auth: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`; `APP_URL` define URLs de retorno (padrão `https://app.meucarrin.com`)
  - Cliente no app: `src/services/planos.ts`

**Dados de produto e geografia (chamadas diretas do app, sem chave):**
- Open Food Facts - `https://world.openfoodfacts.org/api/v2/product/` (`src/services/productLookup.ts`); ligado por `EXPO_PUBLIC_OPEN_FOOD_FACTS`
- Nominatim/OpenStreetMap - geocodificação `https://nominatim.openstreetmap.org/search` (`src/services/geocode.ts`)
- OpenFreeMap - estilo de mapa `https://tiles.openfreemap.org/styles/liberty` (MapLibre, `src/ui/market/OffersMap.web.tsx`)

**Notificações:**
- Expo Push Service - `https://exp.host/--/api/v2/push/send` (`supabase/functions/send-push/index.ts`); token obtido em `src/services/push.ts` (requer `projectId` do EAS)

## Armazenamento de Dados

**Bancos:**
- Supabase Postgres (projeto `meu-carrin`; URL padrão embutida em `src/lib/config.ts`, sobrescrevível por `EXPO_PUBLIC_SUPABASE_URL`)
  - Conexão: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (pública, protegida por RLS)
  - Cliente: `@supabase/supabase-js` (`src/services/supabase.ts`, `src/services/remoteAdapter.ts`); migrações em `supabase/migrations/`
  - Sincronização local-remoto: `src/data/sync.ts`
- SQLite local (`expo-sqlite`): `src/data/schema.ts`, `src/data/expoDriver.ts`, `src/data/repository.ts`

**Armazenamento de arquivos:**
- Supabase Storage, bucket `promotion-images` (imagens de ofertas, políticas em `supabase/migrations/20261109120000_marketplace.sql`)
- Imagens de OCR processadas em memória, não armazenadas

**Cache:**
- Service worker da PWA (gerado por `scripts/build-web.mjs`); sem cache de servidor

## Autenticação e Identidade

**Provedor:**
- Supabase Auth, e-mail e senha (`supabase/config.toml`, `src/services/auth.ts`)
  - Cadastro habilitado, login anônimo desativado, sem confirmação de e-mail
  - Recuperação de senha por e-mail com redirect para `/auth/nova-senha`
  - Sessão guardada em `expo-secure-store` (`src/services/secureStorage.ts`)
  - Funções com `verify_jwt = true`: `receipt-ocr`, `stripe-checkout`, `stripe-portal`, `assistente`; sem JWT: `send-push` (segredo `PUSH_CRON_SECRET`) e `stripe-webhook` (assinatura Stripe)

## Monitoramento e Observabilidade

**Rastreamento de erros:** Nenhum detectado
**Logs:** Logs padrão das Edge Functions do Supabase; sem analytics

## CI/CD e Deploy

**Hospedagem:**
- Cloudflare Workers: app (`wrangler.jsonc`, nome `confereai`, `npm run deploy:cf`) e landing (`wrangler.site.jsonc`, nome `meucarrin`, `npm run deploy:site`)
- GitHub Pages (`.github/workflows/deploy-web.yml`) e Netlify (`netlify.toml`)
- EAS Build/Submit para Android/iOS (`eas.json`)
- Supabase para banco e funções

**Pipeline de CI:**
- GitHub Actions `.github/workflows/deploy-web.yml` (push em `master`): `npm ci`, `typecheck`, `jest`, `test:db`, build web, deploy no Pages; usa as vars `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## Configuração de Ambiente

**Variáveis necessárias:**
- App: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (opcionais: sem elas o app roda local), `EXPO_PUBLIC_OPEN_FOOD_FACTS`, `EXPO_PUBLIC_PRIVACY_CONTACT`, `EXPO_PUBLIC_WEB_URL`
- Build: `EXPO_BASE_URL`, `SITE_URL`, `SITE_APP_URL`
- Edge Functions: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (fornecidas pelo Supabase), `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `OCR_PROVIDER`, `GOOGLE_VISION_API_KEY`, `OPENAI_API_KEY`, `OPENAI_STT_MODEL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`, `PUSH_CRON_SECRET`

**Local dos segredos:**
- `.env` (app, ignorado pelo git) e `supabase/functions/.env` (funções); em produção, `supabase secrets set` e variáveis do GitHub Actions; `google-play-service-account.json` (envio ao Google Play) presente na raiz. Nenhum conteúdo foi lido.

## Webhooks e Callbacks

**Entrada:**
- `stripe-webhook` (Supabase Function): eventos `checkout.session.completed` e `customer.subscription.*`; verifica `stripe-signature` e grava em `public.subscriptions`
- `send-push`: chamada periódica (Cron/pg_cron + pg_net) com `Authorization: Bearer <PUSH_CRON_SECRET>`
- Deep link `meucarrin://` e redirect `/auth/nova-senha`

**Saída:**
- Expo Push API (`send-push`); chamadas à Stripe, Anthropic, OpenAI e Google Vision a partir das funções

## Dublês de teste

- `e2e/fake-supabase.mjs` simula o Supabase nos testes e2e; `e2e/pagamento-stripe.mjs` cobre o fluxo Stripe

---

*Auditoria de integrações: 2026-11-25*
