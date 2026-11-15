/* marca — "A marca" · 3,2 s
   Ideia: o celular chega da profundidade girando, a tela acende — e só depois, com a tela
   já lida, a marca se escreve ao lado, pequena e calma.
   v2: antes o símbolo, o nome e uma assinatura entravam quase junto com o celular, três
   mensagens em três segundos. Agora o celular tem a cena para ele; a marca assina e sai de
   cena. O nome grande fica para o fecho, onde ele é o assunto.
   Saída: a câmera mergulha na tela do celular. */
Motion.cena('marca', {
  render: (c) => `
    ${c.cenario('estudio', { detalhes: { cantos: true } })}
    <div class="halo" data-z="-0.45"></div>
    <div class="fone-w cn-flutua" data-z="0.1">
      ${c.mockup('celular', { tela: `${c.foto('inicio')}<div class="acende"></div>`, classe: 'fone' })}
    </div>
    <div class="assinatura" data-z="0.18">
      <div class="simbolo">${c.svg('simbolo', { classe: 'simbolo-svg' })}</div>
      <h2 class="nome">Meu <span class="destaque">Carrin</span></h2>
    </div>
    ${c.bokeh({ n: 5, tamanho: [12, 26], cores: ['#3ACB8B', '#FFFFFF'], classe: 'cn-bokeh-frente', z: 0.7 })}
    ${c.poeira({ n: 14, semente: 3 })}`,

  montar(el, api) {
    el.letras = api.tipo.dividir(el.$('.nome'), { por: 'letra' });
    el.cn = api.cenario.montar(el, { abertura: 0.8, deriva: 0.8 });
  },

  quadro(t, el, api) {
    window.legendaFilme(api, el, t);
    const { ease, prog, lerp } = api;

    // O celular chega da profundidade girando e assenta quase de frente, sem parar nunca.
    const chega = ease.outExpo(prog(t, 0.05, 1.05));
    const vida = Math.sin((t - 1.05) * 0.9) * 2.2;
    api.midia.mockup(el.$('.fone'), {
      ry: lerp(34, 7, chega) + (t > 1.05 ? vida : 0),
      rx: lerp(-10, 2, chega),
      s: lerp(0.62, 1, chega),
      y: lerp(6, 0, chega),
    });
    api.set(el.$('.fone-w'), { blur: lerp(0.9, 0, ease.outQuart(prog(t, 0.05, 0.75))) });

    // A tela acende de dentro para fora. Até aqui, o quadro é só o aplicativo.
    api.set(el.$('.acende'), { o: 1 - ease.outCubic(prog(t, 0.5, 1.25)) });

    // Só com a tela já lida a marca assina, a partir do símbolo.
    const simb = ease.outBack(1.2)(prog(t, 1.45, 1.9));
    api.set(el.$('.simbolo'), { s: lerp(0.5, 1, simb), o: ease.outCubic(prog(t, 1.45, 1.7)) });
    api.tipo.focar(t, el.letras, { inicio: 1.62, cascata: 0.026 });
    api.tipo.brilho(t, el.letras, { inicio: 2.35, dur: 0.6 });

    // A luz verde atrás respira, mais discreta que o celular.
    api.set(el.$('.halo'), {
      o: lerp(0.3, 0.52, api.vida(t, { periodo: 2.6 })),
      s: lerp(0.86, 1.02, ease.outCubic(prog(t, 0, 1.6))),
    });

    el.cn.quadro(t, { zoom: lerp(0.97, 1.025, ease.outSine(prog(t, 0, 4.25))) });
  },
});
