/* economia — "O mês fechado" · 4,0 s
   Ideia: as barras sobem do chão e o número trava na batida, em verde.
   A primeira barra é a fita do cupom da cena anterior (ponte "fita").
   Saída: tudo converge num ponto de luz, de onde nasce a marca. */
Motion.cena('economia', {
  render: (c) => `
    ${c.cenario('estudio', { detalhes: { cantos: true } })}
    <div class="luz-w" data-z="-0.5"><div class="luz"></div></div>
    <div class="bloco" data-z="0.08">
      <div class="bloco-mov">
        <span class="rotulo">GASTO EM NOVEMBRO</span>
        <div class="numero">R$ 0,00</div>
        <div class="compara"><i class="seta">↓</i> R$ 9,58 a menos que em outubro</div>
        <div class="grafico">
          <div class="col">
            <div class="barra barra-out" data-ponte="fita"></div>
            <span class="mes">out</span><span class="val">R$ 239,06</span>
          </div>
          <div class="col">
            <div class="barra barra-nov"></div>
            <span class="mes">nov</span><span class="val">R$ 229,48</span>
          </div>
        </div>
      </div>
    </div>
    ${c.bokeh({ n: 4, tamanho: [14, 24], cores: ['#3ACB8B'], classe: 'cn-bokeh-frente', z: 0.7 })}
    ${c.poeira({ n: 14, semente: 9 })}`,

  montar(el, api) {
    el.compara = api.tipo.dividir(el.$('.compara'), { por: 'palavra' });
    el.cn = api.cenario.montar(el, { abertura: 0.8, deriva: 0.8 });
  },

  quadro(t, el, api) {
    const { ease, prog, lerp } = api;

    api.set(el.$('.rotulo'), { o: ease.outCubic(prog(t, 0.9, 1.2)) });

    // A barra que veio da fita assenta; a outra sobe em cascata.
    const a = ease.outExpo(prog(t, 0.0, 0.6));
    const b = ease.outExpo(prog(t, 0.45, 1.1));
    api.set(el.$('.barra-out'), { style: { height: `${lerp(0, 100, a)}%` } });
    api.set(el.$('.barra-nov'), { style: { height: `${lerp(0, 96, b)}%` } });
    el.$$('.col .mes').forEach((m, i) => api.set(m, { o: ease.outCubic(prog(t, 0.5 + i * 0.12, 0.8 + i * 0.12)) }));
    el.$$('.col .val').forEach((m, i) => api.set(m, { o: ease.outCubic(prog(t, 0.7 + i * 0.12, 1.0 + i * 0.12)) }));

    // O número conta e trava na batida, com um estalo curto.
    api.tipo.contar(t, el.$('.numero'), { de: 0, ate: 229.48, inicio: 1.2, travar: 2.0, casas: 2, prefixo: 'R$ ' });
    const estalo = 1 + 0.06 * (1 - ease.outQuart(prog(t, 2.0, 2.3))) * (t >= 2.0 ? 1 : 0);
    api.set(el.$('.numero'), { s: estalo, o: ease.outCubic(prog(t, 1.15, 1.4)) });

    // Onda de luz verde quando ele trava.
    api.set(el.$('.numero'), { bright: lerp(1.5, 1, ease.outCubic(prog(t, 2.0, 2.5))), semEstalo: true });

    api.tipo.focar(t, el.compara, { inicio: 2.25, cascata: 0.03 });

    // A barra de novembro dá um pulso curto na batida e assenta.
    const pulso = 1 - 0.05 * Math.sin(Math.PI * prog(t, 2.75, 3.05));
    api.set(el.$('.barra-nov'), { sy: pulso, origem: '50% 100%' });

    api.set(el.$('.luz'), { o: lerp(0.3, 0.55, api.vida(t, { periodo: 2.4 })), s: lerp(0.9, 1.04, ease.outCubic(prog(t, 0, 2))) });
    el.cn.quadro(t, { zoom: lerp(0.98, 1.02, ease.outSine(prog(t, 0, 4.0))) });
  },
});
