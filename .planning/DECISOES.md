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
| 1 · Design system | — |
| 2 · Site | — |
| 3 · Aplicativo | — |
| 4 · Conversão | aguarda a leitura por foto em produção |
| 5 · Medição | — |
| 6 · Stripe em teste | — |
| 7 · Acessibilidade | — |
| 8 · Regressão e publicação | — |
