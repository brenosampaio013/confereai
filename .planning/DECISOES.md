# Meu Carrin 2.0 — decisões da reformulação

Registro das decisões tomadas antes de implementar. Quem retomar o trabalho em outra sessão
começa por aqui, depois `.planning/codebase/`. Auditoria completa (fase 1, 25/11/2026):
https://claude.ai/artifact/NwiG3UDTiP4CnUFDmdmbzw

Aprovadas pelo responsável pelo produto em 25/11/2026 ("pode seguir com suas recomendações").

| # | Tema | Decisão |
|---|---|---|
| 1 | Primeira dobra do site | O título continua sendo a conferência do cupom ("o mercado te cobrou certo?"). Os benefícios do briefing (orçamento, organização, comparação de preços, histórico) entram abaixo dela. Não se anuncia lista de compras. |
| 2 | Lista de compras / "marcar como comprado" | Fora desta reformulação. Não existe no app e não será anunciada. Se vier, é um projeto próprio (modelo de dados, sincronização, RLS). |
| 3 | Cor principal | Verde escuro nos elementos de ação e superfícies de destaque, verde claro como destaque, fundos branco e cinza suave. O logotipo fica como está (marinho e verde). |
| 4 | Planos na vitrine | Só Grátis e Mais. O plano IA sai da vitrine até o assistente funcionar (o código continua, atrás de `disponivel: false`). O Família também sai: só pode aparecer como recurso futuro com aprovação explícita. A lista de espera continua gravada no banco. |
| 5 | Medição do funil | Tabela própria no Supabase, só inserção, sem dado pessoal, com RLS. Eventos de assinatura gravados pelo webhook, que é a fonte confiável. Sem serviço pago e sem terceiros. |
| 6 | Publicação | Todo o trabalho no ramo `redesign-2.0`. Nada entra em `master` (que publica em produção) sem autorização explícita. Ponto de recuperação: `master` em `eaccb6c` e a tag local `antes-redesign-2.0`. |
| 7 | Ordem | A leitura por foto é ligada antes da etapa de conversão. Ligar exige a chave da Anthropic nos segredos do Supabase e publicar `receipt-ocr`: as duas coisas só com autorização explícita no momento. |

## Regras que valem para todas as etapas

- Antes de cada etapa: arquivos, mudanças e riscos. Depois: testes, resultado, arquivos e pendências.
- Nada de produção (deploy, segredos, migração no banco de produção) sem autorização explícita.
- Migrações só incrementais; as existentes não mudam.
- Preços, chaves de busca e lógica de pagamento da Stripe não mudam, salvo defeito provado por teste.
- O app nunca decide plano nem cota: lê do servidor (`my_plan`, `ocr_allowance`).
- Nenhum recurso anunciado sem estar funcionando de verdade.
- Testes de ponta a ponta mudam o texto que procuram junto com a interface, sem afrouxar o que verificam.

## Andamento

| Etapa | Situação |
|---|---|
| 0 · Base segura | concluída em 25/11 — Banner corrigido; encerramento corrigido (causa: corrida da sincronização) |
| 1 · Design system | concluída em 25/11 — aprovado e aplicado: `src/ui/theme.ts`, componentes de `src/ui/`, telas de conta no visual do app, Archivo no app, cupom serrilhado no relatório. Referência: https://claude.ai/artifact/DaYfDXtkbHv9yRhWNb3qKK |
| 2 · Site | concluída em 25/11 — cores do design system, faixa de benefícios, só Grátis e Mais, 13 perguntas (com cobrança, renovação e cancelamento) e o JSON-LD gerado delas, capturas novas do app. Não vai ao ar antes da leitura por foto e da Stripe ligadas em produção |
| 3 · Aplicativo | concluída em 25/11 — Início com painel do mês (dados reais) e ações em lista; Meu plano só com Grátis e Mais; histórico legível; capturas do site refeitas |
| 4 · Conversão | aguarda a leitura por foto em produção |
| 5 · Medição | concluída em 25/11 — tabela `analytics_events` sem dado pessoal, porta única `registrar_evento`, eventos de assinatura pelo webhook; testada no banco, no app (e2e) e no site (check-site). Migração ainda não aplicada em produção |
| 6 · Stripe em teste | — |
| 7 · Acessibilidade | — |
| 8 · Regressão e publicação | — |

## Pendências registradas na etapa 1

- Fonte no iOS: o iOS lê o nome da família de dentro de cada arquivo; não deu para conferir num aparelho. No Android, o projeto gerado registra a família "Archivo" com os cinco pesos.
- ~~Textos com `fontWeight` soltos~~: conferido na etapa 3, todos passam por `T` ou por um estilo com a Archivo.
- A tela inicial ainda mostra "Foto do produto e preço" (leitura por IA), que depende da leitura por foto ligada em produção (decisão 7).

## Pendências registradas na etapa 2

- O filme da landing ainda mostra o visual antigo (marinho). Opções: renderizar de novo ou tirar da página.
- A landing anuncia a leitura por foto e a assinatura do Mais. Em produção, falta a chave da Anthropic (receipt-ocr) e faltam os segredos da Stripe no Supabase: o site novo só entra no ar depois disso.
- Os termos de uso ainda descrevem o plano IA ("ainda não está disponível para contratação"). É texto legal: mudar só com a revisão do responsável.
- ~~Tela Planos com o IA "Em breve"~~: resolvido na etapa 3 (`VITRINE`/`OFERTAS` em `src/domain/planos.ts`).

## Pendências registradas na etapa 3

- A tela do assistente (`/assistente`) só abre pelo endereço, mas ainda cita o plano Meu Carrin IA e leva para Planos, onde o IA não aparece. Fica assim até o assistente funcionar (decisão 4).
- O painel "Este mês" do Início mostra R$ 0,00 no começo de cada mês, até a primeira compra encerrada.

## Pendências registradas na etapa 5

- Aplicar `20261125120000_medicao.sql` no banco de produção e publicar de novo o `stripe-webhook`: só com autorização.
- A política de privacidade não menciona a contagem de eventos. Ela não guarda dado pessoal, mas por transparência vale uma frase: texto legal, só com revisão do responsável.
- A função `registrar_evento` é aberta a visitantes (o site precisa disso): alguém pode inflar a contagem chamando a função em massa. Não expõe dado nenhum; se virar problema, dá para limitar por janela de tempo.
