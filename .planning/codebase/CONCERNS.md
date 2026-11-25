# Preocupações do código (Codebase Concerns)

**Data da análise:** 2026-11-25

## Dívida técnica

**Encerrar compra que voltava a ficar em andamento — CORRIGIDO em 2026-11-25:**
- Causa raiz (medida com registros temporários e reproduzida em teste determinístico): o `pull()` de `src/data/sync.ts` conferia a linha local (versão e pendência), e só depois, com outras esperas no meio, gravava a cópia do servidor. Um encerramento gravado nessa janela era apagado pela cópia mais antiga. A janela era frequente porque `sync()` conferia a trava `running`, esperava duas respostas (internet e sessão) e só então a marcava: pedidos simultâneos (alteração, rede, volta ao primeiro plano) rodavam até cinco sincronizações em paralelo, cada uma regravando as mesmas linhas.
- Correção: a trava passou a ser marcada antes de qualquer espera, e a regra de quem vence (versão mais nova; no empate, a local ainda não enviada) foi para dentro do próprio comando de gravação (`ON CONFLICT ... DO UPDATE ... WHERE`), conferida pelo banco no instante de gravar.
- Testes: `__tests__/data/repository.test.ts` — "encerrar a compra durante uma sincronização não é desfeito pela cópia antiga do servidor" e "duas sincronizações pedidas ao mesmo tempo rodam uma só". Os dois falhavam antes da correção. A suíte de ponta a ponta passou 3 de 3 depois.
- Hipóteses descartadas: carga da máquina, recarregamento da página antes de gravar (explicação dada em 2026-11-23 e errada), durabilidade do SQLite no navegador.
- Resíduos que continuam valendo: `finish()` em `src/screens/CartScreen.tsx` não tem `try/catch`, e `showAlert` (`src/lib/dialog.ts`) não aguarda nem captura o `onPress`; uma falha de gravação continua invisível para a pessoa. `updatePurchase` faz várias escritas sem transação.

**`Banner` com texto misturado a variáveis — CORRIGIDO em 2026-11-25:**
- `src/ui/components.tsx`: a decisão "o conteúdo é só texto?" virou `soTexto()`, que aceita string, número e listas deles (texto misturado a expressões no JSX). Teste: `__tests__/ui/texto.test.tsx`, que falhava nos casos do defeito.
- Os dois chamadores afetados (`src/app/product/[id].tsx:72`, `src/app/offers/publish.tsx:187`) passam a ser renderizados dentro de `<T>` sem mudança neles. A verificação no Android continua pendente (o app nunca rodou em aparelho).

**Blocos `catch` vazios que engolem erros:**
- Problema: `catch {` sem registro ou propagação em `src/services/assistente.ts` (63, 94), `src/services/planos.ts:43`, `src/services/prices.ts:98`, `src/services/location.ts:69`, `src/services/geocode.ts:50`, `src/services/marketplace.ts:219`, `src/services/productLookup.ts:54`, `src/services/ocr.ts:75`, `src/data/sync.ts:80`, `src/data/repository.ts:34`, `src/app/item/add.tsx:273`, `src/app/assistente.tsx:49`, `src/ui/RemoteImage.tsx:30`, `src/lib/files.ts:28`, `src/domain/fiscal.ts` (148, 165).
- Impacto: falhas de rede, de OCR e de sincronização ficam invisíveis, o que dificulta diagnosticar defeitos como o do encerramento. Alguns são fallbacks legítimos; outros ocultam erro real.
- Abordagem de correção: revisar um a um; manter o fallback silencioso só onde for intencional (e comentar), e registrar ou exibir nos demais. Não há serviço de monitoramento de erros no projeto.

**Arquivos grandes:**
- `src/data/repository.ts` (939 linhas) concentra todo o acesso a dados; `src/ui/components.tsx` (456) mistura vários componentes; `src/services/marketplace.ts` (421). Dividir ao tocar neles em mudanças maiores.

**Nomes de infraestrutura divergentes da marca:**
- `wrangler.jsonc` (`name: confereai`), caminho `/confereai` no GitHub Pages e `confere-ai.db` continuam com o nome antigo por decisão documentada em `README.md`. Não renomear sem plano de migração (apagaria dados locais).

## Bugs conhecidos

**Encerrar compra às vezes não persiste:** corrigido em 2026-11-25; ver "Dívida técnica" acima.

**Banner com conteúdo misto:** corrigido em 2026-11-25; ver acima.

## Considerações de segurança

**Segredos de produção ausentes e funções não implantadas:**
- Em produção, as Edge Functions `receipt-ocr` e `send-push` **não estão implantadas**; `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e `ANTHROPIC_API_KEY` **não estão definidos**.
- Arquivos: `supabase/functions/receipt-ocr/index.ts`, `supabase/functions/send-push/index.ts`, `supabase/functions/stripe-checkout/index.ts`, `supabase/functions/stripe-webhook/index.ts`, `supabase/functions/stripe-portal/index.ts`, `supabase/functions/assistente/index.ts`, `supabase/functions/_shared/stripe.ts`.
- Impacto: leitura de nota por OCR, notificações push, pagamento/assinatura (Stripe) e o assistente de voz (Anthropic) não funcionam em produção. O app precisa degradar bem; verificar o tratamento em `src/services/ocr.ts`, `src/services/push.ts`, `src/services/planos.ts`, `src/services/assistente.ts`.
- Recomendação: implantar as funções e definir os segredos no Supabase (nunca no repositório); validar com um teste de fumaça em produção.

**Confirmação de e-mail desligada, sem SMTP próprio:**
- `supabase/config.toml` linha 15: `enable_confirmations = false`. Qualquer pessoa cria conta com e-mail que não possui, o que permite falsificar identidade e facilita abuso do marketplace. Sem SMTP próprio, o envio padrão do Supabase tem limite baixo e não serve para produção (recuperação de senha em `src/app/auth/recuperar.tsx` também depende disso).
- Recomendação: configurar SMTP próprio e ligar a confirmação antes do lançamento; telas `src/app/auth/confirmar.tsx` e `src/app/auth/criar-conta.tsx` já existem.

**Funções com `verify_jwt = false`:**
- `send-push` (protegida por `PUSH_CRON_SECRET`) e `stripe-webhook` (assinatura `stripe-signature`) dependem de verificação interna. Conferir que a falta do segredo faz a função recusar a chamada, e não aceitar.

**Arquivos sensíveis no diretório do projeto:**
- Existem `.env` e `supabase/functions/.env` (não lidos nesta análise) e, segundo o mapeamento, `google-play-service-account.json`. Confirmar que estão no `.gitignore` e que nunca foram commitados.

## Gargalos de desempenho

**Escritas em laço em `updatePurchase`:**
- `src/data/repository.ts` linhas 316-321: para cada linha de `price_history` há um `UPDATE` e um `enqueue`, sem transação. Em compras grandes isso é lento e não é atômico.
- Melhoria: um único `UPDATE ... WHERE purchase_id = ?` e enfileiramento em lote, dentro de transação.

**Atraso de sincronização:**
- `bump()` em `src/state/AppContext.tsx` (linha 196) recria o temporizador de 4 s a cada alteração, e `syncTimer` é variável de módulo. Sem problema de escala hoje, mas dificulta testes.

## Áreas frágeis

**Implantação e CI:**
- Todo push em `master` publica em produção no Cloudflare **sem esperar o CI**. O build do Cloudflare (`wrangler.jsonc`, `npm run deploy:cf`) corre em paralelo com `.github/workflows/deploy-web.yml`, que roda `typecheck`, `jest` e `test:db` e só então publica no GitHub Pages. Uma versão com testes quebrados vai ao ar no Cloudflare.
- Correção: fazer o Cloudflare depender do CI (implantar a partir do workflow após os testes, ou proteger o branch com checks obrigatórios e desligar a implantação automática por push).
- O workflow não roda `npm run test:e2e` nem `npm run lint`.

**Banco local no navegador e cabeçalhos de isolamento:**
- O SQLite na web exige COOP/COEP vindos de `dist/_headers`, gerado por `scripts/build-web.mjs`. Qualquer mudança no build ou em hospedagem que perca esses cabeçalhos quebra o banco. O GitHub Pages não permite definir cabeçalhos próprios; verificar se a publicação do Pages funciona de fato com o banco local.

**Sincronização e resolução de conflitos:**
- `src/data/sync.ts` resolve conflito por `updated_at` comparado como string; relógios de aparelhos divergentes podem fazer a versão errada vencer. Testes em `__tests__/` cobrem a lógica, mas não cenários de relógio adiantado.

**Cobertura de plataformas:**
- O app **nunca rodou em aparelho físico**; o e2e (`e2e/*.mjs`, Playwright) cobre só a web. Câmera, leitor de código de barras (`src/app/scan.tsx`, `src/app/capture.tsx`), notificações (`src/services/push.ts`), `expo-secure-store` (`src/services/secureStorage.ts`), mapa nativo (`src/ui/market/OffersMap.tsx`) e `expo-sqlite` nativo (`src/data/expoDriver.ts`) não foram exercitados em Android/iOS. Espere erros de plataforma, como o do `Banner`.

## Limites de escala

- Não medido. Quota do assistente é por pessoa (`supabase/functions/assistente/index.ts`); limites de OCR e Stripe dependem de funções ainda não implantadas.

## Dependências em risco

**Versões muito recentes e acopladas:**
- `expo ~58`, `react-native 0.88.1`, `react 19.3.0`, `react-native-reanimated 4.7.1`, `react-native-worklets 0.13.0`, `react-native-screens ~4.30.0` em `package.json`. Combinações novas têm mais chance de incompatibilidade nativa que só aparece em aparelho. Atualizar em bloco com `npx expo install --check`.
- `maplibre-gl 6.15.0` fixo, usado só na web (`src/ui/market/OffersMap.web.tsx`).

## Funcionalidades críticas ausentes

**Operação em produção:**
- Sem monitoramento de erros nem logs centralizados.
- Sem build/envio para a loja a partir de CI (`eas.json` existe; publicação Android depende de credencial local).
- OCR, push, pagamentos e assistente inoperantes em produção (ver segurança).

## Lacunas de cobertura de testes

**Interface e plataformas nativas:**
- O que não é testado: renderização de telas e componentes (`src/screens/*.tsx`, `src/ui/*.tsx`); caminho nativo.
- Arquivos: `src/ui/components.tsx` (`Banner`), `src/screens/CartScreen.tsx`.
- Risco: erros de texto fora de `<Text>` e falhas de encerramento passam despercebidos.
- Prioridade: Alta.

**Edge Functions:**
- Só `supabase/functions/_shared/stripe.test.ts` existe; `receipt-ocr`, `send-push`, `assistente`, `stripe-*` não têm testes próprios. Prioridade: Média.

**Estabilidade do e2e:**
- `e2e/budget.e2e.mjs` usa `waitForTimeout` fixos (1200 ms, 1500 ms) em vez de condições, e depende de `e2e/fake-supabase.mjs`. É a fonte do teste intermitente. Prioridade: Alta.

**Banco:**
- `supabase/tests/*.test.mjs` (PGlite) cobrem RLS, marketplace, planos, preços e contrato; não cobrem funções implantadas nem e-mail/SMTP.

---

*Auditoria de preocupações: 2026-11-25*
