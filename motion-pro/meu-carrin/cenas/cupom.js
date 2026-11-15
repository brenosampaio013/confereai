/* cupom — "A conferência" · 5,0 s · o clímax do filme
   Ideia: a fita do cupom desce e cada linha acende em verde, até uma travar em vermelho.
   No fim, a mesa escurece até o azul-marinho da próxima cena (ver .noite).
   O quadro da diferença saiu de z 0,26 para z 0,07: a abertura da câmera o deixava fora do
   plano focal e ele chegava desfocado — logo ele, que carrega o número da cena.
   Entrada: ponte "papel" — a fita que o aplicativo imprimiu na cena anterior abre aqui e
   traz o palco claro com ela.
   Saída: ponte "fita" — o corpo da fita vira a primeira barra do gráfico da próxima cena. */
const LINHAS = [
  { d: 'ARROZ 5KG', q: '1 un x 28,90', v: '28,90' },
  { d: 'CAFE 500G', q: '2 un x 24,90', v: '49,80', erro: true },
  { d: 'LEITE INTEGRAL 1L', q: '6 un x 5,49', v: '32,94' },
  { d: 'PEITO FRANGO KG', q: '1 un x 16,90', v: '16,90' },
  { d: 'ACUCAR 1KG', q: '1 un x 4,79', v: '4,79' },
  { d: 'DETERGENTE 500ML', q: '3 un x 3,29', v: '9,87' },
];
const T_CONFERE = 0.8;
const PASSO = 0.21;

Motion.cena('cupom', {
  render: (c) => `
    ${c.cenario('papel', { grade: 'pontos', detalhes: { cantos: true } })}
    <div class="noite-w" data-z="-0.85"><div class="noite"></div></div>
    <div class="frase-w" data-z="0.2"><h2 class="frase">Pagou o preço da gôndola?</h2></div>
    <div class="fita-w" data-z="0.06">
      <div class="fita-mov">
        <div class="fita" data-ponte="papel">
          <div class="serra serra-topo"></div>
          <div class="fita-corpo" data-ponte="fita">
            <div class="loja">SUPERMERCADO CENTRAL</div>
            <div class="doc">CUPOM FISCAL ELETRONICO</div>
            <div class="tracejado"></div>
            ${LINHAS.map((l, i) => `
              <div class="lin" data-i="${i}">
                <div class="lin-txt"><span class="d">${l.d}</span><span class="v">${l.v}</span></div>
                <div class="lin-q">${l.q}</div>
                <i class="marca-ok">✓</i>
              </div>`).join('')}
            <div class="tracejado"></div>
            <div class="lin-total"><span>TOTAL</span><span>143,20</span></div>
          </div>
          <div class="serra serra-base"></div>
        </div>
      </div>
    </div>
    <div class="dif-w" data-z="0.07">
      <div class="dif">
        <div class="dif-cab">Preço diferente do registrado</div>
        <div class="dif-par"><span>Na gôndola</span><b>R$ 22,90</b></div>
        <div class="dif-par"><span>No cupom</span><b class="caro">R$ 24,90</b></div>
        <div class="dif-res"><span>Diferença</span><b class="conta">+ R$ 0,00</b></div>
      </div>
    </div>
    ${c.poeira({ n: 10, semente: 2 })}
    <div class="leg-w">${c.ui.legenda()}</div>`,

  montar(el, api) {
    el.palavras = api.tipo.dividir(el.$('.frase'), { por: 'palavra' });
    el.lins = el.$$('.lin');
    el.cn = api.cenario.montar(el, { abertura: 0.8, deriva: 0.5 });
  },

  quadro(t, el, api) {
    window.legendaFilme(api, el, t);
    const { ease, prog, lerp, clamp } = api;

    // A fita chega do mergulho da cena anterior: aqui ela só assenta. O deslocamento é
    // curto de propósito — ela já estava no quadro, e um movimento grande aqui reabriria a
    // sensação de que são dois objetos diferentes.
    const assenta = ease.outQuart(prog(t, 0.0, 0.66));
    const treme = api.tremor(t, 2.4, { forca: 0.55, freq: 11, amortecimento: 9 });
    api.set(el.$('.fita-mov'), { y: lerp(-5, 0, assenta) + treme.y, x: treme.x, r: treme.giro * 0.2 });

    // As linhas conferem uma a uma; a do café trava em vermelho.
    el.lins.forEach((lin, i) => {
      const t0 = T_CONFERE + i * PASSO;
      const ok = ease.outBack(1.6)(prog(t, t0, t0 + 0.26));
      const erro = LINHAS[i].erro ? ease.outCubic(prog(t, 2.4, 2.72)) : 0;
      api.set(lin, {
        style: {
          background: erro > 0.02 ? `color-mix(in srgb, var(--vermelho-suave) ${Math.round(erro * 100)}%, transparent)` : 'transparent',
          boxShadow: erro > 0.02 ? `inset ${0.5 * erro}cqmin 0 0 var(--vermelho)` : 'none',
        },
      });
      api.set(lin.querySelector('.marca-ok'), {
        s: lerp(0.4, 1, ok), o: ok * (1 - erro),
        style: { color: 'var(--verde)' },
      });
      api.set(lin.querySelector('.v'), { style: { color: erro > 0.5 ? 'var(--vermelho-texto)' : 'var(--tinta)' } });
    });

    // O quadro da diferença sobe e o valor conta até + R$ 2,00.
    const d = ease.outBack(1.2)(prog(t, 2.85, 3.4));
    api.set(el.$('.dif'), { y: lerp(7, 0, d), o: ease.outCubic(prog(t, 2.85, 3.15)), s: lerp(0.94, 1, d) });
    api.tipo.contar(t, el.$('.conta'), { de: 0, ate: 2, inicio: 3.3, travar: 3.9, casas: 2, prefixo: '+ R$ ' });

    api.tipo.focar(t, el.palavras, { inicio: 0.55, cascata: 0.045 });

    // A cena PREPARA a seguinte: a luz da mesa cai e o papel-kraft vira o azul-marinho do
    // gráfico. Antes, a ponte tinha de atravessar bege e navy ao mesmo tempo e o meio da
    // passagem virava uma lavagem cinza-esverdeada, sem leitura. Agora, quando a fita vira
    // barra, os dois palcos já são a mesma cor — a ponte só carrega a forma.
    api.set(el.$('.frase'), { o: 1 - ease.inCubic(prog(t, 3.85, 4.25)) });
    api.set(el.$('.noite'), { o: ease.inOutSine(prog(t, 4.0, 4.65)) });

    el.cn.quadro(t, { zoom: lerp(1, 1.04, ease.outSine(prog(t, 0, 4.75))) });
  },
});
