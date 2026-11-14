/* gancho — "A pergunta" · 4,0 s
   Ideia: as etiquetas atravessam a câmera e o número do caixa sobe sozinho; a pergunta
   fica parada no meio, sem resposta. O número nunca trava: é esse o ponto.
   Saída: a câmera avança e desfoca.
   Nota: o movimento vai sempre num embrulho DENTRO do data-z — a câmera é dona da camada. */
const ETIQUETAS = [
  { nome: 'ARROZ 5KG', preco: '28,90', z: 0.72, topo: 12, giro: -4, atraso: 0.0, dur: 2.0 },
  { nome: 'CAFE 500G', preco: '22,90', z: 0.62, topo: 56, giro: 5, atraso: 0.45, dur: 2.2 },
  { nome: 'LEITE 1L', preco: '5,49', z: 0.8, topo: 33, giro: -6, atraso: 1.15, dur: 1.8 },
  { nome: 'ACUCAR 1KG', preco: '4,79', z: -0.55, topo: 20, giro: 3, atraso: 0.0, dur: 5.2 },
  { nome: 'DETERGENTE', preco: '3,29', z: -0.62, topo: 68, giro: -3, atraso: 0.8, dur: 5.6 },
];

const etiqueta = (e, i) => `
  <div class="etq-w" data-z="${e.z}" data-i="${i}">
    <div class="etq-mov cn-flutua" style="top:${e.topo}cqh">
      <div class="etq">
        <div class="etq-nome">${e.nome}</div>
        <div class="etq-preco"><span>R$</span>${e.preco}</div>
        <div class="etq-codigo"></div>
      </div>
    </div>
  </div>`;

const DIGITOS = '01234567890123456789'.split('');
const tambor = (i) => `<span class="tambor"><span class="rolo" data-col="${i}">${DIGITOS.map((d) => `<i>${d}</i>`).join('')}</span></span>`;

Motion.cena('gancho', {
  render: (c) => `
    ${c.cenario('estudio', { detalhes: { cantos: true } })}
    ${ETIQUETAS.map(etiqueta).filter((_, i) => ETIQUETAS[i].z < 0).join('')}
    <div class="centro" data-z="0">
      <div class="centro-mov">
        <div class="caixa">
          <span class="caixa-rotulo">TOTAL NO CAIXA</span>
          <div class="caixa-valor">
            <span class="cifra">R$</span>
            ${tambor(0)}${tambor(1)}${tambor(2)}<span class="virgula">,</span>${tambor(3)}${tambor(4)}
          </div>
        </div>
        <h2 class="frase">Quanto já deu?</h2>
      </div>
    </div>
    ${ETIQUETAS.map(etiqueta).filter((_, i) => ETIQUETAS[i].z > 0).join('')}
    ${c.poeira({ n: 16, semente: 7 })}`,

  montar(el, api) {
    el.palavras = api.tipo.dividir(el.$('.frase'), { por: 'palavra' });
    el.rolos = el.$$('.rolo');
    el.passo = api.caixa(el.$('.rolo i')).a; // em cqw, como todo o motor
    // a ordem no DOM mudou (fundo antes do centro, frente depois): siga o data-i
    el.movs = ETIQUETAS.map((_, i) => el.$(`.etq-w[data-i="${i}"] .etq-mov`));
    el.cn = api.cenario.montar(el, { abertura: 0.85, deriva: 1 });
  },

  quadro(t, el, api) {
    const { ease, prog, lerp, clamp } = api;

    // As etiquetas atravessam o quadro; as da frente, grandes e rápidas.
    el.movs.forEach((mov, i) => {
      const e = ETIQUETAS[i];
      const frente = e.z > 0;
      const p = clamp((t - e.atraso) / e.dur, 0, 1);
      api.set(mov, {
        x: lerp(frente ? 86 : 62, frente ? -92 : -62, p),
        r: e.giro + lerp(-3, 3, p),
        s: frente ? lerp(1.18, 1.26, p) : 0.58,
        o: (frente ? 0.96 : 0.42) * ease.outQuart(prog(t, e.atraso, e.atraso + 0.2)),
      });
    });

    // O número rola sem parar: cada coluna numa velocidade, a da direita mais rápida.
    el.rolos.forEach((rolo, i) => {
      const vel = [1.1, 1.7, 2.6, 5.2, 8.4][i];
      const volta = ((t + i * 0.37) * vel) % 10;
      api.set(rolo, { y: -volta * el.passo, blur: lerp(0.05, 0.2, Math.min(1, vel / 8)) });
    });
    const some = ease.inCubic(prog(t, 3.45, 4.0));
    api.set(el.$('.caixa'), { o: lerp(1, 0.1, some), s: lerp(1, 0.96, some) });

    // A pergunta sai do desfoque, palavra a palavra, e fica.
    api.tipo.focar(t, el.palavras, { inicio: 1.0, cascata: 0.045 });

    el.cn.quadro(t, { zoom: lerp(1, 1.045, ease.outSine(prog(t, 0, 4.0))) });
  },
});
