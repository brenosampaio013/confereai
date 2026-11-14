/* leitura — "A etiqueta vira preço" · 4,0 s
   Ideia: a etiqueta é fotografada e os campos do formulário se escrevem sozinhos, um a um.
   Saída: corte no eixo, do produto para o caixa. */
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
        </div>
      </div>
    </div>
    <h2 class="frase" data-z="0.2">A etiqueta vira preço</h2>
    ${c.poeira({ n: 12, semente: 5 })}`,

  montar(el, api) {
    el.palavras = api.tipo.dividir(el.$('.frase'), { por: 'palavra' });
    el.cn = api.cenario.montar(el, { abertura: 0.85, deriva: 0.6 });
  },

  quadro(t, el, api) {
    const { ease, prog, lerp, clamp } = api;

    // A etiqueta grande, cortada pela borda; depois recua para o canto.
    const recua = ease.outExpo(prog(t, 1.05, 1.75));
    api.set(el.$('.etq-mov'), {
      x: lerp(-4, -8, recua), y: lerp(0, -18, recua),
      s: lerp(1, 0.42, recua), r: lerp(-4, -8, recua),
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
    api.set(el.$('.forma-mov'), { y: lerp(8, 0, ent), o: ease.outCubic(prog(t, 1.2, 1.5)), s: lerp(0.95, 1, ent) });
    api.ui.digitar(el.$('.dig-nome'), t, 1.45, { cps: 38, cursor: false });
    api.ui.digitar(el.$('.dig-peso'), t, 2.0, { cps: 38, cursor: false });
    api.ui.digitar(el.$('.dig-preco'), t, 2.25, { cps: 38, cursor: false });

    // O quadro do preço promocional sobe em âmbar.
    const p = ease.outBack(1.4)(prog(t, 2.7, 3.2));
    api.set(el.$('.promo'), { y: lerp(5, 0, p), o: ease.outCubic(prog(t, 2.7, 3.0)), s: lerp(0.96, 1, p) });

    api.tipo.focar(t, el.palavras, { inicio: 1.9, cascata: 0.045 });

    el.cn.quadro(t, { zoom: lerp(1.06, 1, ease.outQuart(prog(t, 0, 1.3))) * lerp(1, 1.02, prog(t, 1.3, 4)) });
  },
});
