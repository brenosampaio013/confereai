# Publicação na Google Play — Confere Aí

Guia passo a passo e conteúdo pronto para a ficha da loja. Responsável: Breno Sampaio · contato: atendimentoencantoindiana@gmail.com.

## 0. Antes de começar (decisões)

- **Supabase/OCR configurados ou não?** Sem o `.env` preenchido, o app publicado funciona só no aparelho: sem conta, sincronização e **sem leitura automática de cupom** (o usuário digita os itens). As respostas de "Segurança dos dados" abaixo mudam conforme essa escolha (ver seção 5).
- **Teste em celular real primeiro.** O app nunca rodou em um aparelho físico. Use a faixa de **teste interno** antes de qualquer lançamento público.
- **Conta pessoal nova no Play Console:** o Google exige um **teste fechado com pelo menos 12 testadores por 14 dias seguidos** antes de liberar a produção. Contas de organização não têm essa exigência.

## 1. Contas necessárias

| Conta | Custo | Para quê |
|---|---|---|
| Google Play Console (https://play.google.com/console) | US$ 25, pagamento único | Publicar o app. Exige verificação de identidade. |
| Expo (https://expo.dev/signup) | Gratuito (plano free tem fila de build) | Gerar o arquivo `.aab` assinado na nuvem (EAS). |

## 2. Gerar o build de produção

Na pasta do projeto, no seu computador:

```bash
npx eas-cli@latest login
```

```bash
npx eas-cli@latest init
```

```bash
npx eas-cli@latest build --profile production --platform android
```

- O `init` vincula o projeto à sua conta Expo (grava `extra.eas.projectId` no `app.json`; faça commit depois).
- Na primeira vez, aceite que o EAS **gere e guarde a chave de assinatura**. Não perca acesso à conta Expo: é ela que guarda essa chave.
- Variáveis do Supabase (se for usar): cadastre antes com `npx eas-cli@latest env:create --environment production` para `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- Ao final, baixe o arquivo `.aab` pelo link mostrado.

## 3. Criar o app no Play Console

1. **Criar app** → nome `Confere Aí`, idioma padrão Português (Brasil), tipo **App**, **Gratuito**.
2. **Testar e lançar → Teste interno → Criar nova versão** → envie o `.aab` (o **primeiro envio tem que ser manual**, pela interface).
3. Adicione seu e-mail como testador e instale pelo link de teste.

Envios seguintes podem ser automáticos com `eas submit` (exige uma conta de serviço do Google Cloud com acesso ao Play Console; salve o JSON como `google-play-service-account.json` na raiz — o arquivo está no `.gitignore`):

```bash
npx eas-cli@latest submit --profile production --platform android
```

O `eas.json` já está configurado para enviar à faixa **internal** como **rascunho**.

## 4. Ficha da loja (Presença na loja → Ficha principal)

**Nome do app** (máx. 30): `Confere Aí: confira compras` (27)

**Descrição curta** (máx. 80):
```
Registre suas compras e confira o cupom fiscal antes de sair do caixa.
```

**Descrição completa** (máx. 4000):
```
O Confere Aí ajuda você a conferir as compras do supermercado e a encontrar possíveis erros no cupom fiscal: produtos cobrados duas vezes, quantidades diferentes, preços diferentes do anunciado e itens que não aparecem na nota.

COMO FUNCIONA

1. Durante a compra, escaneie o código de barras dos produtos e informe o preço da etiqueta. O total é atualizado na hora.
2. No caixa, fotografe o cupom fiscal ou digite os itens.
3. O Confere Aí compara o que você registrou com o que foi cobrado e mostra o resultado em verde, amarelo ou vermelho, explicando cada ponto em linguagem simples.

Não escaneou nada? Tudo bem: você também pode conferir só a nota. O app procura linhas repetidas, contas que não fecham e itens que precisam de revisão.

RECURSOS
• Leitura de código de barras (EAN-13, EAN-8, UPC e outros) com lanterna
• Proteção contra leituras repetidas: segurar o produto diante da câmera não adiciona unidades extras
• Produtos por unidade, por quilo e por litro
• Descontos e preços promocionais com as condições da oferta
• Leitura da etiqueta de preço pela câmera
• Cupons compridos em várias fotos
• Leitura do QR Code da NFC-e
• Revisão e correção de todos os dados lidos
• Histórico de compras e de preços de cada produto
• Funciona sem internet no supermercado
• Conta opcional para guardar os dados na nuvem
• Ofertas da comunidade: publique promoções encontradas na loja, com foto e verificação de localização, e confirme as de outras pessoas

PRIVACIDADE
Sem conta, seus dados ficam só no seu celular. As fotos dos cupons não são guardadas na nuvem e só são enviadas para leitura com a sua autorização.

IMPORTANTE
O Confere Aí é uma ferramenta de apoio. As cores indicam pontos de atenção, não a confirmação de um erro de cobrança. Em caso de dúvida, confira o cupom impresso com o atendente do caixa.
```
> Se publicar **sem** Supabase/OCR, troque "fotografe o cupom fiscal ou digite os itens" por "digite os itens do cupom" e retire "Leitura da etiqueta de preço pela câmera", "Cupons compridos em várias fotos" e "Conta opcional...". A descrição não pode prometer recursos que não funcionam.

**Gráficos** (pasta `store/android/`):
| Item | Arquivo | Exigência |
|---|---|---|
| Ícone | `icone-512.png` | 512×512 PNG |
| Gráfico de recursos | `banner-1024x500.png` | 1024×500 |
| Capturas do celular | `screenshots/01…06.png` | 2 a 8, 1080×1920 |

As capturas foram feitas no próprio app com produtos de exemplo.

**Categoria:** Compras · **Tags sugeridas:** compras, lista de compras, supermercado
**E-mail de contato:** atendimentoencantoindiana@gmail.com · **Site:** opcional

## 5. Conteúdo do app (Política → Conteúdo do app)

**Política de privacidade** — a página está em `docs/privacidade.html` (responsável Breno Sampaio, contato atendimentoencantoindiana@gmail.com). Ative o GitHub Pages (repositório → Settings → Pages → Branch `master`, pasta `/docs`). A URL será:
```
https://brenosampaio013.github.io/confereai/privacidade.html
```
O mesmo contato aparece dentro do app (padrão em `src/lib/config.ts`; pode ser trocado por `EXPO_PUBLIC_PRIVACY_CONTACT`).

**Anúncios:** Não contém anúncios.
**Acesso ao app:** Todo o app está disponível sem restrições (não exige login).
**Classificação de conteúdo:** responda o questionário IARC — categoria "Utilitário/produtividade"; sem violência, sexo, linguagem, drogas, apostas ou interação entre usuários. Resultado esperado: Livre.
**Público-alvo:** 18 anos ou mais (o app não é direcionado a crianças).
**App de notícias:** Não. **App governamental:** Não. **Recursos financeiros:** Não oferece serviços financeiros.
**Saúde:** Não.

### Segurança dos dados

**A) Publicando com Supabase e OCR configurados**

| Pergunta | Resposta |
|---|---|
| O app coleta ou compartilha dados do usuário? | Sim |
| Os dados são criptografados em trânsito? | Sim (HTTPS) |
| O usuário pode pedir a exclusão dos dados? | Sim (aba Conta, ou pelo contato da política) |

| Tipo de dado | Coletado | Compartilhado | Processamento temporário | Obrigatório? | Finalidade |
|---|---|---|---|---|---|
| Informações pessoais → **Endereço de e-mail** | Sim | Não | Não | Opcional (só com conta) | Funcionalidade do app; gerenciamento da conta |
| Informações financeiras → **Histórico de compras** | Sim | Não | Não | Opcional (só com conta) | Funcionalidade do app |
| Fotos e vídeos → **Fotos** | Sim | Não | Cupons: **sim** (só para extrair o texto). Ofertas do marketplace: não (ficam guardadas e visíveis a outros usuários, por ação do próprio usuário) | Opcional | Funcionalidade do app |
| Local → **Local exato** | Sim | Não | **Sim** (usado só para calcular a distância até a loja; as coordenadas não são guardadas) | Opcional | Funcionalidade do app; prevenção de fraude |
| Atividade no app → **Outros conteúdos gerados pelo usuário** | Sim | Não | Não | Opcional | Funcionalidade do app (ofertas, confirmações, denúncias) |

"Compartilhado = Não" porque Supabase, Anthropic e Google Cloud atuam como **prestadores de serviço** em nome do app, o que a política do Google não considera compartilhamento. Ofertas publicadas no marketplace ficam visíveis a outros usuários por ação de quem publica (o Google não considera isso compartilhamento com terceiros). Não marque contatos, IDs de dispositivo, dados de uso ou registros de falha: o app não os coleta. Se publicar **sem** o marketplace configurado, retire as linhas de localização e de conteúdo gerado pelo usuário.

**B) Publicando sem Supabase (somente no aparelho)**

"O app coleta ou compartilha dados do usuário?" → **Não**. (A consulta ao Open Food Facts envia só o número do código de barras, que não é dado pessoal.)

## 6. Permissões declaradas

- `CAMERA` — ler códigos de barras e fotografar cupons, etiquetas e embalagens.
- O microfone está bloqueado (`RECORD_AUDIO` em `blockedPermissions`).
- O acesso às fotos usa o seletor do sistema (sem permissão ampla de armazenamento).

## 7. Lançamento

1. Teste interno: instale e passe pelo checklist abaixo em um celular real.
2. Teste fechado (obrigatório para conta pessoal nova): 12+ testadores por 14 dias.
3. Produção: envie a versão para revisão. A análise do Google costuma levar de algumas horas a alguns dias.

### Checklist no celular antes de lançar
- [ ] Leitor lê EAN-13 de produtos reais; lanterna liga e desliga
- [ ] Segurar o produto diante da câmera não adiciona unidades extras
- [ ] Negar a câmera mostra a explicação e a opção de digitar o código
- [ ] Fechar o app no meio da compra e abrir de novo recupera o carrinho
- [ ] Modo avião: registrar produtos continua funcionando
- [ ] (Com OCR) Foto de cupom real é lida; itens e total conferem com o impresso
- [ ] Conferência mostra divergência quando a quantidade é alterada de propósito
- [ ] Excluir dados do aparelho apaga tudo
