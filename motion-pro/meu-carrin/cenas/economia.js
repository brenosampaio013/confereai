/* economia — "O mês fechado" · 4,2 s · a conclusão visual da história
   Ideia: as barras sobem do chão — a prova — e só depois o ganho trava em verde.
   A primeira barra é a fita do cupom da cena anterior (ponte "fita").
   v2: a hierarquia estava invertida. O número gigante era o GASTO do mês (R$ 229,48) e a
   economia vinha miúda embaixo, num tamanho que ninguém lê. Num filme que vende controle de
   gasto, o herói do quadro é a diferença. Agora o ganho é o número grande, o gasto do mês
   continua escrito na barra de novembro (nada escondido) e os rótulos do gráfico cresceram
   o bastante para serem lidos em tela de celular.
   Os dois valores são os mesmos de antes: outubro R$ 239,06, novembro R$ 229,48.
   O bokeh verde da frente saiu: ele cruzava o número herói e derrubava o contraste do "↓"
   para 2,5:1. Numa cena cuja função é ser lida, a decoração é a primeira a sair.
   Saída: tudo converge num ponto de luz, de onde nasce a marca. */
Motion.cena('economia', {
  render: (c) => `
    ${c.cenario('estudio', { detalhes: { cantos: true } })}
    <div class="luz-w" data-z="-0.5"><div class="luz"></div></div>
    <div class="varre-w" data-z="0.5"><div class="varre"></div></div>
    <div class="bloco" data-z="0.08">
      <div class="bloco-mov">
        <span class="rotulo">O MÊS FECHADO</span>
        <div class="ganho"><i class="seta">↓</i><span class="numero">R$ 0,00</span></div>
        <div class="compara">a menos que em outubro</div>
        <div class="grafico">
          <div class="col">
            <div class="barra barra-out" data-ponte="fita"></div>
            <span class="val">R$ 239,06</span><span class="mes">outubro</span>
          </div>
          <div class="col">
            <div class="barra barra-nov"></div>
            <span class="val val-nov">R$ 229,48</span><span class="mes">novembro</span>
          </div>
        </div>
      </div>
    </div>
    ${c.poeira({ n: 14, semente: 9 })}`,

  montar(el, api) {
    el.compara = api.tipo.dividir(el.$('.compara'), { por: 'palavra' });
    el.cn = api.cenario.montar(el, { abertura: 0.8, deriva: 0.8 });
  },

  quadro(t, el, api) {
    const { ease, prog, lerp } = api;

    api.set(el.$('.rotulo'), { o: ease.outCubic(prog(t, 0.3, 0.65)) });

    // Primeiro a prova: a barra que veio da fita assenta e a de novembro sobe atrás dela.
    // As barras sobem mais devagar e uma de cada vez, e o valor de cada mês entra junto com
    // a SUA barra — antes os dois rótulos apareciam quase ao mesmo tempo, no meio da subida.
    const a = ease.outExpo(prog(t, 0.0, 0.78));
    const b = ease.outExpo(prog(t, 0.5, 1.4));
    api.set(el.$('.barra-out'), { style: { height: `${lerp(0, 100, a)}%` } });
    api.set(el.$('.barra-nov'), { style: { height: `${lerp(0, 96, b)}%` } });
    el.$$('.col .val').forEach((m, i) => api.set(m, { o: ease.outCubic(prog(t, 0.68 + i * 0.5, 0.98 + i * 0.5)) }));
    el.$$('.col .mes').forEach((m, i) => api.set(m, { o: ease.outCubic(prog(t, 0.82 + i * 0.5, 1.12 + i * 0.5)) }));

    // Só então a conclusão: a diferença conta e trava na batida.
    api.tipo.contar(t, el.$('.numero'), { de: 0, ate: 9.58, inicio: 1.6, travar: 2.3, casas: 2, prefixo: 'R$ ' });
    const entra = ease.outBack(1.2)(prog(t, 1.5, 2.0));
    const estalo = 1 + 0.07 * (1 - ease.outQuart(prog(t, 2.3, 2.65))) * (t >= 2.3 ? 1 : 0);
    api.set(el.$('.ganho'), {
      s: lerp(0.9, 1, entra) * estalo,
      o: ease.outCubic(prog(t, 1.5, 1.8)),
      y: lerp(1.4, 0, entra),
      bright: lerp(1.5, 1, ease.outCubic(prog(t, 2.3, 2.85))),
    });

    api.tipo.focar(t, el.compara, { inicio: 2.55, cascata: 0.03 });

    // A barra de novembro dá um pulso curto na batida e assenta.
    const pulso = 1 - 0.05 * Math.sin(Math.PI * prog(t, 2.9, 3.2));
    api.set(el.$('.barra-nov'), { sy: pulso, origem: '50% 100%' });

    // No hold, uma lâmina de luz atravessa o gráfico. Sem ela o quadro quase não mudava
    // por 1,4 s — a câmera viva sozinha não se sente, e o fim da cena ficava morto.
    const varre = prog(t, 2.6, 4.05);
    api.set(el.$('.varre'), { x: lerp(-66, 66, ease.inOutSine(varre)), o: Math.sin(Math.PI * varre) });

    // E a luz de trás deriva de lado a cena inteira, sem nunca parar: é o que mantém o
    // fundo mudando debaixo das barras enquanto o número fica lido.
    api.set(el.$('.luz'), {
      o: lerp(0.3, 0.55, api.vida(t, { periodo: 2.4 })),
      s: lerp(0.9, 1.04, ease.outCubic(prog(t, 0, 2))),
      x: lerp(-7, 7, t / 4.2),
    });
    el.cn.quadro(t, { zoom: lerp(0.98, 1.02, ease.outSine(prog(t, 0, 4.2))) });
  },
});
