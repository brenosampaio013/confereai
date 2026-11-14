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
