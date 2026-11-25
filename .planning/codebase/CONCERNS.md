# Preocupações do código (Codebase Concerns)

**Data da análise:** 2026-11-25

## Dívida técnica

**Encerrar compra sem tratamento de erro e sem garantia de gravação (defeito intermitente):**
- Problema: em `src/screens/CartScreen.tsx` (`finish()`, linhas 73-85) o `onPress` do botão "Encerrar" é `async` e faz `await repo.updatePurchase(active.id, { status: 'closed' })`, `bump()` e `router.navigate('/')`. Não há `try/catch`: se a gravação falhar, a promessa rejeitada fica sem tratamento e o usuário não vê nada. `showAlert` (`src/lib/dialog.ts`) chama `a.onPress?.()` sem `await` nem captura de erro, então nenhuma falha chega à interface.
- Arquivos: `src/screens/CartScreen.tsx`, `src/lib/dialog.ts`, `src/data/repository.ts` (`updatePurchase`, linhas 296-321), `src/state/AppContext.tsx` (`bump`, `refreshActive`), `src/data/expoDriver.ts`.
- Impacto: a compra pode continuar ativa. O e2e `compra encerrada fica em Minhas compras com orçamento e diferença` (`e2e/budget.e2e.mjs`, ~linha 168) falha de forma intermitente. O próprio teste já traz um comentário (linhas 171-174) dizendo que recarregar a página antes de a gravação terminar desfazia o encerramento. Isso sugere que a gravação no banco do navegador (SQLite no navegador) pode ainda não ser durável quando a navegação ou o reload acontece.
- Causa raiz: **não estabelecida**. Hipóteses a verificar, em ordem:
  1. `updatePurchase` faz várias escritas sequenciais (UPDATE de `purchases`, `logEdit`, `enqueue`, e UPDATE de `price_history` por linha) sem transação. Uma interrupção no meio deixa estado parcial.
  2. A UI navega para `/` assim que o `await` resolve, mas não há garantia de flush/persistência do banco no navegador. O teste espera "Nova compra" e depois apenas 1500 ms fixos (`waitForTimeout`) antes de `page.goto`, e isso é uma espera por tempo, não por condição.
  3. Corrida com a sincronização: `bump()` agenda `syncNow` em 4000 ms. O `pull()` em `src/data/sync.ts` (linhas 148-170) só ignora a linha remota se `local.updated_at > remoteUpdated` (ou `>=` com pendência local). Uma linha remota mais nova ou com relógio divergente pode reverter `status` para `active`. Avaliar também `refreshActive` rodando em paralelo (`src/state/AppContext.tsx`, ~linhas 150-175).
  4. Na web, `showAlert` usa `window.confirm`; o clique em "Encerrar" no teste precisa coincidir com o tratamento do diálogo.
- Abordagem de correção: envolver `finish()` em `try/catch` com aviso ao usuário; fazer `showAlert` aguardar e capturar `onPress`; colocar as escritas de `updatePurchase` em transação; trocar a espera por tempo no e2e por espera de condição (ex.: ler o status no banco); reproduzir em laço (rodar o passo 50 vezes) para isolar a causa antes de mexer.

**`Banner` só envolve em `<T>` quando `children` é uma string única:**
- Problema: `src/ui/components.tsx` linha 236: `typeof children === 'string' ? <T ...>{children}</T> : children`. Quando `children` tem texto misturado com expressões, o JSX gera um array (texto + valores), que não é `string`, e o conteúdo vira texto solto dentro de uma `View`.
- Arquivos: chamadores afetados `src/app/product/[id].tsx:72` (`{formatBRL(...)} / {per}, registrado {ageLabel(...)}.` e a expressão condicional) e `src/app/offers/publish.tsx:187` (`... até {MAX_PHOTOS} fotos.`).
- Impacto: na web a fonte sai errada (sem o estilo de `T`); no Android o React Native lança erro por texto fora de `<Text>` e a tela quebra. Como o app nunca rodou em aparelho físico, o erro não foi visto.
- Abordagem de correção: tratar `string` e `number` e arrays de primitivos (`Array.isArray` com todos os itens `string`/`number`) dentro do `Banner`, ou usar template string nos chamadores. Varrer os demais usos de `<Banner>` (`grep -rn "<Banner" src`) por conteúdo misto. Considerar um teste de renderização com `jest-expo` para evitar regressão.

**Blocos `catch` vazios que engolem erros:**
- Problema: `catch {` sem registro ou propagação em `src/services/assistente.ts` (63, 94), `src/services/planos.ts:43`, `src/services/prices.ts:98`, `src/services/location.ts:69`, `src/services/geocode.ts:50`, `src/services/marketplace.ts:219`, `src/services/productLookup.ts:54`, `src/services/ocr.ts:75`, `src/data/sync.ts:80`, `src/data/repository.ts:34`, `src/app/item/add.tsx:273`, `src/app/assistente.tsx:49`, `src/ui/RemoteImage.tsx:30`, `src/lib/files.ts:28`, `src/domain/fiscal.ts` (148, 165).
- Impacto: falhas de rede, de OCR e de sincronização ficam invisíveis, o que dificulta diagnosticar defeitos como o do encerramento. Alguns são fallbacks legítimos; outros ocultam erro real.
- Abordagem de correção: revisar um a um; manter o fallback silencioso só onde for intencional (e comentar), e registrar ou exibir nos demais. Não há serviço de monitoramento de erros no projeto.

**Arquivos grandes:**
- `src/data/repository.ts` (939 linhas) concentra todo o acesso a dados; `src/ui/components.tsx` (456) mistura vários componentes; `src/services/marketplace.ts` (421). Dividir ao tocar neles em mudanças maiores.

**Nomes de infraestrutura divergentes da marca:**
- `wrangler.jsonc` (`name: confereai`), caminho `/confereai` no GitHub Pages e `confere-ai.db` continuam com o nome antigo por decisão documentada em `README.md`. Não renomear sem plano de migração (apagaria dados locais).

## Bugs conhecidos

**Encerrar compra às vezes não persiste:** ver "Dívida técnica" acima (intermitente, causa não estabelecida).

**Banner com conteúdo misto:** ver acima (`src/app/product/[id].tsx:72`, `src/app/offers/publish.tsx:187`).

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
- `src/data/repository.ts` linhas 316-321: para cada linha de `price_history` há um `UPDATE` e um `enqueue`, sem transação. Em compras grandes isso é lento e, junto com a falta de atomicidade, alimenta o defeito de encerramento.
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
