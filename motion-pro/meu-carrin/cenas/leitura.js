/* leitura — "A etiqueta vira preço" · 4,0 s
   Ideia: a etiqueta é fotografada e os campos do formulário se escrevem sozinhos, um a um.
   v2: a etiqueta tinha entrada nenhuma — a cena abria num objeto parado. Agora ela chega
   da profundidade, com peso e um giro que assenta. E no fim o aplicativo IMPRIME a fita do
   cupom, que sobe em primeiro plano: é ela que vira o quadro inteiro na próxima cena.
   Saída: mergulho na fita impressa (ponte "papel") — o papel claro invade o navy em vez de
   o filme trocar de clima num corte. */
Motion.cena('leitura', {
  render: (c) => `
    ${c.cenario('estudio', { detalhes: { cantos: true } })}
    <div class="etq-w" data-z="0.3">
      <div class="etq-mov">
        <div class="etq">
          <div class="etq-nome">CAFE TORRADO E MOIDO 500G</div>
          <div class="etq-de">DE R$ 24,90</div>
          <div class="etq-preco"><span>R$</span>19,90</div>
          <div class="etq-cond">LEVE 2 PAGUE 1,5</div>
          <div class="etq-codigo"></div>
        </div>
        <div class="guias"><i class="g1"></i><i class="g2"></i><i class="g3"></i><i class="g4"></i></div>
      </div>
    </div>
    <div class="flash"></div>
    <div class="forma-w" data-z="0.05">
      <div class="forma-mov">
        <div class="cartao">
          <div class="cab"><span class="ia">✦</span> Dados lidos da foto — confira antes de salvar</div>
          <div class="campo"><label>Nome do produto</label><div class="valor"><span class="dig-nome" data-texto="Café torrado e moído"></span></div></div>
          <div class="campo"><label>Peso ou volume da embalagem</label><div class="valor"><span class="dig-peso" data-texto="500 g"></span></div></div>
          <div class="campo"><label>Preço por unidade</label><div class="valor"><span class="dig-preco" data-texto="R$ 24,90"></span></div></div>
          <div class="promo">
            <b>Preço promocional na etiqueta: R$ 19,90</b>
            <span>Condições: LEVE 2 PAGUE 1,5</span>
          </div>
          <div class="rec-serra rec-serra-base"></div>
        </div>
      </div>
    </div>
    <h2 class="frase" data-z="0.2">A etiqueta vira preço</h2>
    <div class="calor-w" data-z="-0.3"><div class="calor"></div></div>
    <div class="recibo-w" data-z="0.4">
      <div class="recibo-mov">
        <div class="recibo" data-ponte="papel">
          <div class="rec-serra"></div>
          <div class="rec-corpo">
            <b>SUPERMERCADO CENTRAL</b>
            <u></u>
            ${Array.from({ length: 11 }, () => '<i></i>').join('')}
            <u></u>
          </div>
          <div class="rec-serra rec-serra-base"></div>
        </div>
      </div>
    </div>
    ${c.poeira({ n: 12, semente: 5 })}`,

  montar(el, api) {
    el.palavras = api.tipo.dividir(el.$('.frase'), { por: 'palavra' });
    el.cn = api.cenario.montar(el, { abertura: 0.85, deriva: 0.6 });
    el.recibo = el.$('.recibo-mov');
  },

  quadro(t, el, api) {
    const { ease, prog, lerp, clamp } = api;

    // A etiqueta chega da profundidade com peso; depois recua para o canto.
    const chega = ease.outExpo(prog(t, 0, 0.45));
    const recua = ease.outExpo(prog(t, 1.05, 1.75));
    api.set(el.$('.etq-mov'), {
      x: lerp(-4, -8, recua) + lerp(9, 0, chega),
      y: lerp(0, -18, recua) + lerp(-4, 0, chega),
      s: lerp(1, 0.42, recua) * lerp(1.16, 1, chega),
      r: lerp(-4, -8, recua) + lerp(-5.5, 0, chega),
      blur: lerp(0.8, 0, ease.outQuart(prog(t, 0, 0.3))),
      o: 1,
    });

    // As guias do enquadramento fecham e piscam uma vez.
    const fecha = ease.outQuart(prog(t, 0.55, 1.0));
    api.set(el.$('.guias'), {
      s: lerp(1.3, 1, fecha),
      o: (1 - ease.inCubic(prog(t, 1.05, 1.35))) * ease.outCubic(prog(t, 0.45, 0.7)) * (t > 0.92 && t < 1.0 ? 0.35 : 1),
    });

    // O disparo.
    api.set(el.$('.flash'), { o: 0.92 * (1 - ease.outQuart(clamp((t - 1.05) / 0.22, 0, 1))) * (t >= 1.05 ? 1 : 0) });

    // O formulário entra e os campos se escrevem sozinhos.
    const ent = ease.outBack(1.1)(prog(t, 1.2, 1.8));
    // O formulário NÃO escurece no fim: apagar um cartão cheio de texto legível parece
    // defeito, não direção. Quem separa o papel do cartão é a sombra dura da fita e o
    // z-index — e, logo depois, o próprio mergulho, que leva o quadro inteiro.
    api.set(el.$('.forma-mov'), { y: lerp(8, 0, ent), o: ease.outCubic(prog(t, 1.2, 1.5)), s: lerp(0.95, 1, ent) });
    api.ui.digitar(el.$('.dig-nome'), t, 1.45, { cps: 38, cursor: false });
    api.ui.digitar(el.$('.dig-peso'), t, 2.0, { cps: 38, cursor: false });
    api.ui.digitar(el.$('.dig-preco'), t, 2.25, { cps: 38, cursor: false });

    // O quadro do preço promocional sobe em âmbar.
    const p = ease.outBack(1.4)(prog(t, 2.7, 3.2));
    api.set(el.$('.promo'), { y: lerp(5, 0, p), o: ease.outCubic(prog(t, 2.7, 3.0)), s: lerp(0.96, 1, p) });

    api.tipo.focar(t, el.palavras, { inicio: 1.9, cascata: 0.045 });

    // O aplicativo imprime a fita: ela sobe em primeiro plano e o navy esquenta atrás.
    const imp = ease.outQuart(prog(t, 2.72, 3.38));
    api.set(el.recibo, { y: lerp(78, 6, imp), r: lerp(-3.4, -1.2, imp), s: lerp(0.9, 1, imp) });
    api.set(el.$('.calor'), { o: 0.6 * ease.outCubic(prog(t, 2.8, 3.5)), s: lerp(0.7, 1.1, imp) });


    el.cn.quadro(t, { zoom: lerp(1.06, 1, ease.outQuart(prog(t, 0, 1.3))) * lerp(1, 1.025, prog(t, 1.3, 4)) });
  },
});
