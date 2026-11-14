# 08 · UI e app

Interface realista e genérica: tela de bloqueio, notificação digitando, toque, balões de conversa, busca, terminal, perfil.

**Assinatura**: a notificação desce com mola e digita sozinha; um toque abre a conversa e os balões estouram.
**Transições preferidas**: `mascara-circular`, `mergulho`, `empurrar`, `chicote`.
**Referências**: Vídeo 4 (notificação), Shopify, Vídeo 1 (DMs).
**Arquivos**: `tokens.css` (cores e fontes do estilo), `exemplo.js` e `exemplo.css` (uma cena pronta de 3,4 s), `capa.jpg` (o quadro da galeria).

## Quando usar
App, SaaS, serviço digital, direct response, prova social (mensagens, notificações, avaliações reais), tutorial de ferramenta.

## DNA visual
- **Kit de interface genérico** (`c.ui.*`): tela de bloqueio, notificação, balões de conversa, busca, terminal, perfil, card de métrica, botão, cursor e toque.
- **Sem marca de terceiros**: as interfaces são genéricas. Se a peça precisa de uma marca real (a da pessoa, por exemplo), use a logo que ela mandou.
- **Fundo**: o degradê da tela de bloqueio, ou o fundo da marca com o mockup (`c.mockup('celular')`).
- **Tipografia**: grotesca de sistema (Inter Tight), tamanhos de interface ampliados para o vídeo (notificação 2,8 a 4 cqmin).

## DNA de movimento
- Notificação desce com mola curta (`ui.entrar`) e o texto digita sozinho (`ui.digitar`, 30 a 40 caracteres por segundo).
- Toque: círculo que cresce e some (`ui.toque`), e o elemento tocado afunda 4 %.
- Balões estouram um a um (`ui.baloes`), 0,3 a 0,4 s entre eles.
- Cursor percorre chaves com curva (`ui.cursor`) e clica.
- **Zoom para dentro da interface**: a câmera entra no card tocado e ele vira a próxima cena (`mergulho`).

## Transições do estilo
`mergulho` no elemento tocado, `mascara-circular` saindo do ponto do toque, `empurrar` entre telas, `chicote`.

## Regras da casa neste estilo
- Permitido: pílulas, botões, notificações, cursor (é o assunto do estilo).
- Proibido: inventar avaliação, depoimento, número de pedido ou valor como se fosse real. Prova social só com conteúdo verdadeiro da pessoa.

## Receitas de cena
1. **Notificação + toque + conversa** (3,4 s). Base: `o bloco exemplo.js no fim deste arquivo`.
2. **Busca digitando**: barra de busca no centro, o nome da marca digitado, o cursor clica e a página abre (mergulho).
3. **Terminal**: janela de terminal digitando uma frase linha a linha, com o produto desfocado atrás.
4. **Perfil**: o card de perfil da pessoa (dados dela) entra flutuando com o número de seguidores contando.
5. **Mockup com print**: o celular chega da profundidade com o print do app dela na tela e os cards caem em accelerando.

## O que pedir à pessoa
Prints ou gravação de tela do app dela, textos reais das mensagens e notificações, logo e cor.

## Som sugerido
`notificacao` na chegada, `digitacao`, `clique` no toque, `pop` em cada balão.

## Exemplo pronto
`exemplo.js` / `exemplo.css` registram a cena `ui-app`. Para usar num projeto: copie para `cenas/<id>.js` e `.css`, troque `Motion.cena('ui-app'` e o escopo `.cena-ui-app` pelo id da cena, e troque os textos. Ou crie o projeto já com `--estilo ui-app`, que copia os tokens, as fontes e o exemplo para `estilo/` dentro do projeto.

## Cenário, objetos e acabamento

Nada de fundo chapado (`guias/acabamento.md`). Neste estilo:

- **Cenário**: a tela de bloqueio ou `aurora` atrás do celular; `bokeh` claro na frente.
- **Objetos**: `celular` 3D com a tela (`telaTex`) ou o kit de UI; `balao`, `sino`, `coracao` 3D como reações.
- **Acabamento**: bloom 0,15; profundidade entre telas e cards. (Padrão em `estilos/catalogo.json`.)

## Arquivos do estilo

Os blocos abaixo são os arquivos do estilo: `novo-projeto.mjs --estilo` copia os tokens e as fontes para `marca/` e a cena de exemplo para `estilo/` e para as cenas do tipo `estilo`. Para mudar o estilo, edite aqui.

<!-- arquivo: tokens.css -->
````css
/* UI e app · tokens do estilo. Troque as cores pelas da marca da pessoa; mantenha a lógica (um destaque).
   fontes: Inter Tight 400 600 700 800 */
:root {
  --cenario: aurora;
  --fundo: #0b0b10;
  --texto: #ffffff;
  --texto-suave: #a3a3b2;
  --destaque: #2f7cf6;
  --destaque-grad: linear-gradient(100deg, #7fb2ff, #2f7cf6);
  --luz-1: #3a1f6e;
  --luz-2: #0f2f5c;
  --luz-3: #a43cd6;
  --brilho: #ffffff;
  --linha: color-mix(in srgb, #ffffff 14%, transparent);
  --fonte-titulo: 'Inter Tight', system-ui, sans-serif;
  --fonte-texto: 'Inter Tight', system-ui, sans-serif;
  --fonte-ui: 'Inter Tight', system-ui, sans-serif;
  --titulo-peso: 800;
  --titulo-tracking: -0.04em;
  --titulo-entrelinha: 0.95;
  --raio: 2cqmin;
  --mockup-moldura: #0c0d0f;
  --mockup-raio: 3.4cqmin;
  --mockup-sombra: #000000;
}
````

<!-- arquivo: exemplo.js -->
````js
/* ui-app · "UI e app" (3,4 s)
   Ideia: a tela de bloqueio acende, a notificação desce com mola e digita sozinha; um toque abre a
   conversa e os balões estouram um a um. Interface genérica, sem marca de terceiros. */
Motion.cena('ui-app', {
  render: (c) => `
    ${c.ui.telaBloqueio({ hora: '9:41', data: 'segunda-feira, 19 de outubro' })}
    <div class="n">${c.ui.notificacao({ app: 'MP', titulo: 'Motion Pro', texto: 'Seu vídeo ficou pronto. Toque para ver', hora: 'agora', icone: c.emoji('video') })}</div>
    ${c.poeira({ n: 18, semente: 3 })}${c.bokeh({ n: 4, tamanho: [14, 24], cores: ['#ffffff'], classe: 'cn-bokeh-frente', z: 0.7 })}
    <div class="tq">${c.ui.toque()}</div>
    <div class="ch">${c.ui.chat([{ texto: 'Ficou muito profissional', lado: 'outro' }, { texto: 'Faz mais um desse?', lado: 'eu' }, { texto: 'Já tô fazendo', lado: 'outro' }])}</div>`,
  montar(el, api) { el.cn = api.cenario.montar(el, { abertura: 0, deriva: 0.6 }); el.b = api.$$('.u-balao'); },
  quadro(t, el, api) {
    el.cn.quadro(t);
    const { ease, prog } = api;
    api.set(el.$('.u-bloqueio'), { s: api.lerp(1.08, 1, ease.outExpo(prog(t, 0, 0.8))), bright: api.lerp(0.4, 1, ease.outCubic(prog(t, 0, 0.5))) });
    api.ui.entrar(el.$('.u-notif'), t, 0.35);
    api.ui.digitar(el.$('.u-notif-texto'), t, 0.6, { cps: 40, cursor: false });
    api.ui.toque(el.$('.u-toque'), t, 1.45);
    api.set(el.$('.u-notif'), { s: 1 - 0.04 * Math.sin(Math.PI * prog(t, 1.45, 1.65)) });
    api.ui.baloes(el.b, t, [1.7, 2.0, 2.35]);
  },
});
````

<!-- arquivo: exemplo.css -->
````css
.cena-ui-app .u-bloqueio { padding-top: 12cqh; }
.cena-ui-app .u-bloqueio-hora { font-size: 26cqmin; }
.cena-ui-app .n { position: absolute; left: 0; right: 0; top: 33cqh; display: grid; place-items: center; }
.cena-ui-app .u-notif { width: 86cqmin; }
.cena-ui-app .u-notif-icone { background: #fff; }
.cena-ui-app .u-notif-icone .m-emoji { width: 6cqmin; filter: none; }
.cena-ui-app .tq { position: absolute; left: 62cqw; top: 35cqh; }
.cena-ui-app .ch { position: absolute; left: 0; right: 0; top: 50cqh; display: grid; place-items: center; }
.cena-ui-app .u-chat { width: 86cqmin; }
.cena-ui-app .u-balao { font-size: 4.2cqmin; }
````
