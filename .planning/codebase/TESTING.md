# Padrões de Teste

**Data da análise:** 2026-11-25

Há quatro suítes independentes: Jest (app), `node:test` + PGlite (banco), Deno (função Edge) e Playwright (ponta a ponta).

## Framework de Teste

**Runner (app):**
- Jest `^30.5.2` com preset `jest-expo` (`^58.0.13`), `testEnvironment: 'node'`.
- Config: `jest.config.js` — `testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx']` e `moduleNameMapper` de `@/` para `src/`.

**Runner (banco):** `node --test` (módulo nativo `node:test`) com `node:assert/strict` e `@electric-sql/pglite`.

**Runner (função Edge):** Deno (`Deno.test`, `jsr:@std/assert`) em `supabase/functions/_shared/stripe.test.ts`.

**Runner (E2E):** scripts `.mjs` com Playwright (Chromium), orquestrados por `e2e/run.mjs`.

**Asserções:** `expect` do Jest (app); `assert` estrito do Node (banco e E2E).

**Comandos:**
```bash
npm test                 # jest (todos os __tests__)
npm run test:db          # node --test supabase/tests/*.test.mjs
npm run typecheck        # tsc --noEmit && tsc --noEmit -p __tests__
npm run test:all         # typecheck + jest + test:db
npm run test:e2e         # node e2e/run.mjs (demora ~8 min, usa portas 8090/8091)
deno test --allow-import supabase/functions/_shared/stripe.test.ts
```
Não há modo watch nem cobertura configurados nos scripts (Jest aceita `npx jest --watch` / `--coverage` manualmente).

**CI:** `.github/workflows/deploy-web.yml` roda `npm ci`, `npm run typecheck`, `npm test` e `npm run test:db` antes do build web. Não roda E2E nem testes Deno.

## Organização dos Arquivos de Teste

**Localização:** separados do código, em `__tests__/` na raiz, espelhando as camadas de `src/`:
```
__tests__/
├── domain/        # lógica pura (cart, money, receiptParser, reconciliation, planos, ...)
├── data/          # repository.test.ts (SQLite real em memória/arquivo)
├── lib/           # config.test.ts
├── fixtures/      # receipts.ts (textos fictícios de cupom)
├── helpers.ts     # fábricas (cartItem)
├── nodeSqliteDriver.ts  # SqlDriver sobre node:sqlite
└── tsconfig.json  # estende o raiz, types: jest + node
supabase/tests/    # *.test.mjs + helpers.mjs (PGlite)
e2e/               # *.e2e.mjs + fake-supabase.mjs + run.mjs
```

**Nomenclatura:** `<modulo>.test.ts` (Jest), `<tema>.test.mjs` (banco), `<tema>.e2e.mjs` (E2E). Não há testes de componentes React nem de `src/services`/`src/ui`/`src/app`.

## Estrutura dos Testes

**Organização da suíte (Jest):**
```typescript
import { addItem, cartTotals } from '../../src/domain/cart';
import { cartItem } from '../helpers';

describe('carrinho', () => {
  it('adiciona produto e recalcula o total (testes 1 e 7)', () => {
    let items = addItem([], cartItem({ id: 'a', name: 'Arroz 5 kg', unitPriceCents: 2899 }));
    expect(cartTotals(items)).toMatchObject({ totalCents: 2899, lineCount: 1 });
  });
});
```

**Padrões:**
- `describe` e `it` com descrições em português, no indicativo ("remove produto", "não duplica o mesmo item..."). Referências ao roteiro de aceitação aparecem como "(teste N)" no título.
- Imports com caminho relativo para `src/` (não usa o alias `@/`).
- Setup/teardown com `beforeEach`/`afterEach` quando há recurso externo: diretório temporário criado com `mkdtempSync` e removido com `rmSync` em `__tests__/data/repository.test.ts`.
- Comentários inline explicam a aritmética esperada (`// 0,215 × 59,90 = 12,8785 → 12,88`).
- Asserções: `toBe`, `toEqual`, `toMatchObject`, `toHaveLength`. Dinheiro sempre comparado em centavos inteiros.

**Padrão do banco (`node:test`):**
```javascript
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, as as runAs } from './helpers.mjs';

before(async () => { db = await createDb(); });
test('cada usuário vê somente os próprios dados', async () => {
  const mine = await as(A, () => db.query('select id from public.purchases'));
  assert.deepEqual(mine.rows.map((r) => r.id), [pid]);
});
```
`createDb()` em `supabase/tests/helpers.mjs` cria um PGlite, instala um esquema Supabase mínimo (`auth.users`, `auth.uid()`, `storage.*`, papéis `anon`/`authenticated`) e aplica todas as migrações de `supabase/migrations/*.sql` em ordem. `as(db, userId|null, fn)` executa como `authenticated` com `request.jwt.claim.sub` ou como `anon`.

## Mocks

**Framework:** nenhum. Não há `jest.mock`/`jest.fn` no repositório. A estratégia é usar implementações reais e leves em vez de mocks.

**Padrões:**
- Banco do app: `NodeSqliteDriver` (`__tests__/nodeSqliteDriver.ts`) implementa a interface `SqlDriver` (`src/data/sql.ts`) com `node:sqlite` (`:memory:` ou arquivo). Cada teste faz `migrate(db)` com `LOCAL_MIGRATIONS` e instancia `new Repository(db, randomUUID)`.
- Injeção de dependências: id (`randomUUID`) e relógio/timestamp são parâmetros, tornando o domínio determinístico (`updateItem(items, id, patch, 'now')`).
- Sincronização: `SyncService` e `RemoteAdapter` de `src/data/sync.ts` são exercitados com adaptadores remotos escritos à mão dentro do teste.
- Supabase real em testes de integração: PGlite com as migrações reais (banco) e `e2e/fake-supabase.mjs` (PostgreSQL real atrás de uma API que imita o Supabase, com endpoint `/__debug/sql` para preparar e inspecionar dados).
- Stripe: assinatura de webhook gerada localmente com HMAC (`assinar()` em `supabase/functions/_shared/stripe.test.ts`), sem rede.

**O que simular:** relógio, geração de id, driver SQL e rede (por adaptadores/fakes).

**O que não simular:** regras de domínio, SQL/migrações e RLS (sempre contra SQLite/PostgreSQL de verdade).

## Fixtures e Fábricas

**Dados de teste:**
```typescript
// __tests__/helpers.ts
export function cartItem(p: Partial<CartItem> & { name: string; unitPriceCents: number }): CartItem {
  n += 1;
  return { id: p.id ?? `c${n}`, purchaseId: 'p1', saleUnit: 'un', quantityMilli: MILLI, /* ... */ ...p };
}
```
- Fábricas com `Partial<T>` + defaults e `...p` no fim; contador de módulo para ids únicos.
- Textos de cupom fiscal em `__tests__/fixtures/receipts.ts` (`TEST_RECEIPT_NFCE`, `TEST_RECEIPT_TWO_LINES`), exportados como `string[]` por linha. Todos os dados são fictícios (CNPJ de teste com dígitos válidos); o cabeçalho do arquivo exige manter isso. Nunca colocar notas reais.
- Datas fixas de teste no formato ISO (`'2026-10-30T12:00:00.000Z'`) para resultados reproduzíveis.
- Em testes, hostnames e chaves são fictícios (`https://projeto.supabase.co`, `chave-anon-de-teste`, `whsec_teste_...`).

## Cobertura

**Requisito:** nenhum configurado (sem `collectCoverageFrom` nem limite mínimo). O CI não mede cobertura.

**Ver cobertura:**
```bash
npx jest --coverage
```

## Tipos de Teste

**Unitários (Jest, `__tests__/domain`, `__tests__/lib`):** funções puras de domínio — dinheiro (`money`), carrinho (`cart`), unidades, parser de cupom (`receiptParser`), fiscal/etiqueta (`fiscalAndLabel`), conciliação (`reconciliation`), orçamento/finanças, planos, endereço, marketplace, `scanGuard`, permissões, autenticação, assistente.

**Integração (Jest, `__tests__/data/repository.test.ts`):** `Repository` + migrações + sync contra SQLite real; inclui recuperação de compra após "fechar" o app reabrindo o mesmo arquivo, idempotência de inclusão, log de edições e fluxo parser -> conciliação.

**Integração de banco (`supabase/tests/*.test.mjs`):**
- `rls.test.mjs`: isolamento por usuário, `user_id` forçado pelo servidor, bloqueio de escrita cruzada, last-write-wins na sincronização.
- `contract.test.mjs`: lê `src/services/marketplace.ts` como texto, extrai chamadas RPC e acessos a tabela e verifica que nomes de parâmetros/colunas existem no banco.
- `marketplace.test.mjs`, `prices.test.mjs`, `planos.test.mjs`, `waitlist.test.mjs`: regras de cada recurso no SQL.

**Função Edge (Deno):** `supabase/functions/_shared/stripe.test.ts` — verificação de assinatura do webhook (aceita correta, recusa assinatura de outro segredo) e helpers (`planoDoPreco`, `fimDoPeriodo`, ...). Deve provar que a verificação não abre passagem.

**E2E (`e2e/`):** descrito a partir do código, não executado nesta análise. `e2e/run.mjs`:
1. sobe `e2e/fake-supabase.mjs` na porta 8091;
2. gera o app web com `scripts/build-web.mjs` apontando para `http://localhost:8091` (`EXPO_BASE_URL=/confereai`);
3. serve `dist/` na porta 8090 imitando o GitHub Pages;
4. roda em sequência `conta.e2e.mjs`, `planos.e2e.mjs`, `marketplace.e2e.mjs`, `budget.e2e.mjs` (cada um com Playwright/Chromium, viewport mobile 390x844) e falha se algum sair com código != 0 ou imprimir linha começando com `FAIL`. Capturas vão para `e2e-output/`.
Requer `playwright` instalado (`require('playwright')`). `e2e/pagamento-stripe.mjs` não está na lista do runner.

## Padrões Comuns

**Teste assíncrono:**
```typescript
it('não duplica item ao repetir a mesma inclusão', async () => {
  const { repo } = await open();
  const p = await repo.startPurchase();
  await repo.addCartItem(leite(p.id, 'fixo'));
  await repo.addCartItem(leite(p.id, 'fixo'));
  expect(await repo.listCartItems(p.id)).toHaveLength(1);
});
```
Helper local `open()` no topo do arquivo cria driver + migração + repositório.

**Teste de erro/negação:**
```javascript
const anon = await as(null, () => db.query('select id from public.purchases').then(() => 'ok', (e) => e.message));
assert.match(anon, /permission denied/);
```
No banco, capturar a mensagem com `.then(() => 'ok', (e) => e.message)` e afirmar com `assert.match`/`assert.notEqual`. No domínio, afirmar `toBeNull()` ou a lista de mensagens de `validateItem`.

**E2E (formato de passos):**
```javascript
const step = async (name, fn) => { try { await fn(); results.push(`ok   ${name}`); } catch (e) { results.push(`FAIL ${name}: ...`); } };
```

## Regras para novos testes

- Lógica nova em `src/domain` ou `src/lib`: criar `__tests__/<camada>/<modulo>.test.ts`, em português, com fábricas de `__tests__/helpers.ts`.
- Mudança em `src/data` ou migração local: estender `__tests__/data/repository.test.ts` usando `NodeSqliteDriver`.
- Nova migração/RPC/política em `supabase/migrations`: cobrir em `supabase/tests/*.test.mjs` com `createDb()`; se o app chamar a RPC, o `contract.test.mjs` já checa nomes.
- Nova fixture de cupom: somente dados fictícios.
- Rodar `npm run test:all` antes de concluir.

---

*Análise de testes: 2026-11-25*
