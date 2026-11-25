# Convenções de Código

**Data da análise:** 2026-11-25

## Padrões de Nomenclatura

**Arquivos:**
- Módulos de domínio, dados, serviços e lib: `camelCase.ts` (`src/domain/receiptParser.ts`, `src/services/remoteAdapter.ts`, `src/lib/useLoad.ts`).
- Componentes React: `PascalCase.tsx` (`src/ui/PurchaseRow.tsx`, `src/screens/CartScreen.tsx`, `src/ui/market/OfferCard.tsx`). Exceção: `src/ui/components.tsx` e `src/ui/account.tsx` agrupam vários componentes.
- Rotas do Expo Router em `src/app/`: minúsculas, `kebab-case` (`scan-tab.tsx`), `_layout.tsx` para navegadores, `[id].tsx` para parâmetros dinâmicos, `(tabs)` para grupos.
- Variantes de plataforma pelo sufixo: `src/ui/market/OffersMap.tsx` (nativo) e `OffersMap.web.tsx` (web).
- Testes: `<modulo>.test.ts` em `__tests__/<camada>/` (ex.: `__tests__/domain/cart.test.ts`).

**Funções:**
- `camelCase`, verbo no início: `addItem`, `cartTotals`, `parseBRL`, `sharePendingPrices`, `isSharingEnabled`.
- Predicados com `is`/`same`/`parece`: `isValidGtin`, `sameGtin`, `pareceEndereco`.
- Hooks com prefixo `use`: `useLoad`.

**Variáveis e constantes:**
- `camelCase` para variáveis; `UPPER_SNAKE_CASE` para constantes de módulo (`SHARE_PRICES_SETTING`, `MILLI`, `LOCAL_MIGRATIONS`).
- Campos do app/domínio em `camelCase` (`unitPriceCents`, `quantityMilli`); linhas e RPCs do Supabase em `snake_case` (`unit_price_cents`, `p_reports`). A conversão fica na borda: `toRemoteRow` em `src/data/sync.ts` e `src/services/marketplace.ts`.
- Valores monetários sempre em centavos inteiros, sufixo `Cents` (`totalCents`, `discountCents`); quantidades em milésimos, sufixo `Milli` (`quantityMilli`).

**Tipos:**
- `PascalCase` para interfaces e tipos (`CartItem`, `CartTotals`, `SqlDriver`, `CommunityPrice`); sem prefixo `I`. Aliases semânticos para números (`Cents`, `QuantityMilli`).

**Idioma:**
- Identificadores de domínio geralmente em inglês, mas módulos mais recentes usam português (`src/domain/planos.ts`, `endereco.ts`, `assistente.ts`, `doAmbiente`, `pareceEndereco`). Seguir o idioma já usado no módulo que se está editando.
- Comentários, mensagens de erro, textos de UI e nomes de testes: sempre em português do Brasil, com acentuação.

## Estilo de Código

**Formatação:**
- Sem Prettier/Biome. Não há `.prettierrc`. O estilo observado: 2 espaços, aspas simples, ponto e vírgula, vírgula final em listas multilinha, linhas longas aceitas (>120 colunas é comum, ex.: `validateItem` em `src/domain/cart.ts`).
- `.vscode/settings.json` liga `source.fixAll`, `source.organizeImports` e `source.sortMembers` ao salvar.

**Lint:**
- ESLint 9 flat config em `eslint.config.js`, usando `eslint-config-expo/flat`. Ignora `dist/*` e `supabase/functions/*`.
- Rodar com `npm run lint` (`expo lint`). Desabilitar regra só com comentário justificado, como em `src/lib/useLoad.ts`: `// eslint-disable-next-line react-hooks/exhaustive-deps` precedido de explicação.

**TypeScript:**
- `strict: true` em `tsconfig.json` (estende `expo/tsconfig.base`). `npm run typecheck` roda `tsc --noEmit` para o app e `tsc --noEmit -p __tests__` para os testes. `__tests__` e `supabase` são excluídos do tsconfig raiz.
- Usar `import type` para importações só de tipo (`import type { CartItem } from './types'`).
- Preferir `unknown` + validação a `any` (`const bruto: unknown = await resposta.json()` em `src/services/geocode.ts`).

## Organização de Imports

**Ordem observada:**
1. Pacotes externos (`expo-router`, `react`, `react-native`, `@expo/vector-icons`).
2. Aliases `@/...` (`@/data/repository`, `@/lib/format`).
3. Relativos do mesmo diretório (`./components`, `./theme`).

**Aliases:**
- `@/*` mapeia para `src/*` (`tsconfig.json`, `jest.config.js` via `moduleNameMapper`). Usado em `src/services`, `src/ui`, `src/app`.
- Dentro de `src/domain` usam-se imports relativos (`./money`, `./units`). Os testes usam caminhos relativos (`../../src/domain/cart`), não o alias.

## Tratamento de Erros

**Padrões:**
- Domínio puro: funções lançam `Error` com mensagem em português para violação de invariante (`assertCents` em `src/domain/money.ts`) ou devolvem `null` quando a entrada é ambígua (`parseBRL` retorna `null`).
- Validação devolve lista de mensagens, não exceção: `validateItem(...)` retorna `string[]` (vazia = válido) em `src/domain/cart.ts`.
- Serviços de rede/nuvem degradam silenciosamente: retornam valor neutro (`0`, `null`, `[]`) em vez de lançar, com comentário do motivo (`if (error || !data) return 0; // tenta de novo na próxima sincronização` em `src/services/prices.ts`). Checam `getSupabase()`/`isCloudConfigured()`/`isOnline()` antes de agir.
- `catch {}` sem variável e `.catch(() => fallback)` são usados para operações opcionais (compartilhar, abrir link, cache): `src/ui/market/share.ts`, `src/services/geocode.ts`.
- Hooks de tela expõem `error: string | null` (`src/lib/useLoad.ts`), convertendo com `e instanceof Error ? e.message : String(e)`.
- Efeitos assíncronos usam flag `alive` para evitar atualizar estado após desmontar (`useLoad`, `src/ui/StoreSheet.tsx`).

## Logging

**Framework:** `console` direto, usado raramente (um único `console.warn` em `src/lib/config.ts`, com prefixo `[config]`).

**Padrões:**
- Não logar dados de usuário, chaves ou tokens. Mensagens ao usuário passam por `src/lib/dialog.ts`, não por log.

## Comentários

**Quando comentar:**
- Todo módulo de domínio/serviço abre com um bloco `/** ... */` explicando o contrato e as regras (`src/domain/money.ts`: "Valores monetários são sempre inteiros em centavos"; `src/services/prices.ts`: envio e consulta, anonimato).
- Comentar o porquê de decisões não óbvias, incidentes e invariantes (ex.: queda de 19/11/2026 citada em `__tests__/lib/config.test.ts`).
- Comentários em português; sem marcadores TODO/FIXME no código de `src/`.

**JSDoc:**
- `/** ... */` de uma linha acima de funções exportadas descrevendo o comportamento, sem tags `@param`/`@returns` (`/** Subtotal bruto do item: ... */`).

## Design de Funções

**Tamanho:** funções pequenas e puras no domínio (`src/domain/*`); lógica de I/O isolada em `src/data` e `src/services`.

**Parâmetros:** usar `Pick<Tipo, 'campo'>` para aceitar só o que a função lê (`itemGrossCents(item: Pick<CartItem, 'unitPriceCents' | 'quantityMilli'>)`). Objetos de opções para muitos campos.

**Retorno:** funções de domínio são imutáveis e retornam novas coleções (`addItem`, `removeItem`, `updateItem` retornam novo array; `updateItem` recebe o timestamp como argumento `'now'` para ser determinístico). Relógio e gerador de id são injetados (`new Repository(db, randomUUID)`).

## Design de Módulos

**Exports:** exports nomeados em tudo (`export function`, `export interface`). `export default` apenas em telas de `src/app/` (`export default function CaptureScreen()`).

**Barrel files:** não usados; importar do arquivo de origem.

**Camadas:** `src/domain` (puro, sem React/Expo) <- `src/data` (SQLite via `SqlDriver` abstrato em `src/data/sql.ts`) <- `src/services` (Supabase, rede, dispositivo) <- `src/state`, `src/screens`, `src/ui`, `src/app`. Domínio não importa de camadas superiores.

## Componentes e UI

- Componentes de função com tipagem inline das props (`{ s }: { s: PurchaseSummary }`).
- Estilos com `StyleSheet.create` no fim do arquivo; cores e espaçamentos vêm de `src/ui/theme.ts` (`colors`, `space`), nunca hex literal na tela.
- Texto via componente `T` com variante (`v="bodyStrong"`), dinheiro via `Money`, etiquetas via `Pill` (`src/ui/components.tsx`).
- Acessibilidade: `accessibilityRole` e `accessibilityLabel` em elementos pressionáveis.
- Navegação imperativa com `router` de `expo-router`.

## Regras do projeto (AGENTS.md)

- Navegação somente com Expo Router; código que não é rota fica fora de `src/app/`.
- Instalar dependências com `npx expo install`, nunca `npm add`.
- Rodar lint e typecheck antes de concluir qualquer tarefa; consultar a documentação versionada do Expo (SDK 58) em vez de memória.
- Nunca editar `ios/` e `android/` à mão (CNG); configurar em `app.json`/`app.config.js`.

---

*Análise de convenções: 2026-11-25*
