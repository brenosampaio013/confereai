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
    <div class="etq-w" data-z="0.15">
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
    <div class="voa-w" data-z="0.12"><div class="voa">R$ 19,90</div></div>
    <div class="frase-w" data-z="0.2"><h2 class="frase">A etiqueta vira preço</h2></div>
    <div class="calor-w" data-z="-0.3"><div class="calor"></div></div>
    <div class="recibo-w" data-z="0.1">
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
    // abertura menor: com 0,85 a profundidade de campo desfocava a etiqueta, a fita e o
    // número que voa — justamente o que precisa ser lido nesta cena
    el.cn = api.cenario.montar(el, { abertura: 0.5, deriva: 0.6 });
    el.recibo = el.$('.recibo-mov');

    // O preço promocional VOA da etiqueta para o quadro âmbar do cartão: é o gesto que liga
    // os dois objetos. Sem ele a etiqueta e o cartão eram duas coisas no mesmo quadro, e a
    // relação entre o preço da gôndola e o valor registrado ficava por conta do espectador.
    // A origem é a etiqueta JÁ RECUADA (x -8, y -18, escala 0,42 sobre o centro do embrulho).
    const mov = api.caixa(el.$('.etq-mov'));
    const pre = api.caixa(el.$('.etq-preco'));
    el.voaDe = [mov.cx - 8 + 0.42 * (pre.cx - mov.cx), mov.cy - 18 + 0.42 * (pre.cy - mov.cy)];
    const alvo = api.caixa(el.$('.promo'));
    el.voaPara = [alvo.cx, alvo.cy];
  },

  quadro(t, el, api) {
    const { ease, prog, lerp, clamp } = api;

    // A etiqueta chega da profundidade com peso; depois recua para o canto.
    const chega = ease.outQuart(prog(t, 0, 0.7));
    const recua = ease.outExpo(prog(t, 1.05, 1.75));
    // Depois de assentar, a etiqueta continua viva: parar seco dá o "degrau" que o medidor
    // de fluidez acusa, e no resto do filme nenhum objeto trava de vez num hold.
    const flutua = chega * (1 - recua);
    api.set(el.$('.etq-mov'), {
      x: lerp(-4, -8, recua) + lerp(9, 0, chega) + 0.5 * Math.sin(t * 1.15) * flutua,
      y: lerp(0, -18, recua) + lerp(-4, 0, chega) + 0.42 * Math.sin(t * 0.83 + 1.2) * flutua,
      s: lerp(1, 0.42, recua) * lerp(1.16, 1, chega),
      r: lerp(-4, -8, recua) + lerp(-5.5, 0, chega) + 0.5 * Math.sin(t * 0.69 + 0.4) * flutua,
      blur: lerp(0.8, 0, ease.outQuart(prog(t, 0, 0.3))),
      // a etiqueta apaga antes do mergulho: menos um objeto no quadro da passagem
      o: 1 - ease.inCubic(prog(t, 2.95, 3.3)),
    });

    // As guias do enquadramento fecham e piscam uma vez.
    const fecha = ease.outQuart(prog(t, 0.55, 1.0));
    api.set(el.$('.guias'), {
      s: lerp(1.3, 1, fecha),
      o: (1 - ease.inCubic(prog(t, 1.05, 1.35))) * ease.outCubic(prog(t, 0.45, 0.7)) * (t > 0.92 && t < 1.0 ? 0.35 : 1),
    });

    // O disparo.
    api.set(el.$('.flash'), { o: 0.92 * (1 - ease.outQuart(clamp((t - 1.05) / 0.22, 0, 1))) * (t >= 1.05 ? 1 : 0) });

    // O formulário entra JUNTO com o flash e os campos começam logo: antes ele ficava meio
    // segundo no quadro como um cartão branco vazio, que é o que mais chamava atenção ali.
    const ent = ease.outBack(1.1)(prog(t, 1.05, 1.6));
    // O formulário NÃO escurece: apagar um cartão cheio de texto legível parece defeito,
    // não direção. No fim ele SAI de quadro, para o mergulho ter um objeto só.
    const sai = ease.inOutCubic(prog(t, 2.92, 3.34));
    api.set(el.$('.forma-mov'), {
      y: lerp(8, 0, ent),
      x: lerp(0, 26, sai),
      o: ease.outCubic(prog(t, 1.05, 1.32)) * (1 - ease.inCubic(prog(t, 3.0, 3.34))),
      s: lerp(0.95, 1, ent),
    });
    api.ui.digitar(el.$('.dig-nome'), t, 1.3, { cps: 40, cursor: false });
    api.ui.digitar(el.$('.dig-peso'), t, 1.82, { cps: 40, cursor: false });
    api.ui.digitar(el.$('.dig-preco'), t, 2.06, { cps: 40, cursor: false });

    // O preço promocional voa da etiqueta até o quadro âmbar e chega quando ele acende.
    const voo = prog(t, 2.18, 2.62);
    const ev = ease.outCubic(voo);
    const arco = -7 * Math.sin(Math.PI * voo); // sobe um pouco no meio do caminho
    api.set(el.$('.voa'), {
      x: lerp(el.voaDe[0], el.voaPara[0], ev),
      y: lerp(el.voaDe[1], el.voaPara[1], ev) + arco,
      s: lerp(0.82, 0.42, ease.inOutCubic(voo)) * lerp(1.12, 1, ease.outCubic(prog(voo, 0, 0.2))),
      o: ease.outCubic(prog(voo, 0, 0.16)) * (1 - ease.inCubic(prog(voo, 0.82, 1))),
    });

    // O quadro do preço promocional acende quando o número chega nele.
    const p = ease.outBack(1.4)(prog(t, 2.56, 3.0));
    api.set(el.$('.promo'), { y: lerp(5, 0, p), o: ease.outCubic(prog(t, 2.56, 2.8)), s: lerp(0.96, 1, p) });

    api.tipo.focar(t, el.palavras, { inicio: 1.9, cascata: 0.045 });

    // O aplicativo imprime a fita: ela sobe ao centro, em primeiro plano, e o navy esquenta
    // atrás. Enquanto ela sobe, o cartão sai e a etiqueta apaga — quando a câmera mergulha,
    // só o papel está no quadro. Era a sobreposição dos três que dava a impressão de
    // elementos duplicados durante a passagem.
    const imp = ease.outQuart(prog(t, 2.72, 3.34));
    api.set(el.recibo, { x: lerp(0, 16, imp), y: lerp(78, 4, imp), r: lerp(-3.4, -1, imp), s: lerp(0.9, 1, imp) });
    api.set(el.$('.calor'), { o: 0.72 * ease.outCubic(prog(t, 2.8, 3.4)), s: lerp(0.7, 1.12, imp) });
    api.set(el.$('.frase'), { o: 1 - ease.inCubic(prog(t, 3.0, 3.34)) });


    el.cn.quadro(t, { zoom: lerp(1.06, 1, ease.outQuart(prog(t, 0, 1.3))) * lerp(1, 1.025, prog(t, 1.3, 4)) });
  },
});
