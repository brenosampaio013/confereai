/* gancho — "A pergunta" · 3,6 s
   Ideia: o total do caixa SOBE — um odômetro de verdade, em que os centavos giram e as
   dezenas carregam. É o gasto que se acumula sem ninguém ver. A pergunta chega depois e
   fica sem resposta. O número nunca assenta: é esse o ponto.
   v2: antes o tambor girava ao acaso (parecia caça-níquel). Agora ele conta, e conta o
   carrinho verdadeiro da cena 3 — a conta que o filme vai mostrar sendo feita.
   Saída: a câmera avança e desfoca.
   Nota: o movimento vai sempre num embrulho DENTRO do data-z — a câmera é dona da camada.
   v3: o desfoque das rodas caiu de 0,26 para 0,085 (os algarismos fantasmavam uns nos
   outros) e as etiquetas da frente saíram da faixa central — elas cruzavam por cima da
   pergunta e cortavam a leitura dela.
   A subida também termina em 2,4 s em vez de 3,3: nas casas de centavo a roda gira centenas
   de voltas por segundo e nenhum ajuste de desfoque a torna legível. O que resolve é dar ao
   espectador quase um segundo com o número PARADO e nítido antes de a cena virar. */
const ETIQUETAS = [
  { nome: 'ARROZ 5KG', preco: '28,90', z: 0.72, topo: 9, giro: -4, atraso: 0.0, dur: 2.3 },
  { nome: 'CAFE 500G', preco: '22,90', z: 0.62, topo: 90, giro: 5, atraso: 0.6, dur: 2.5 },
  { nome: 'LEITE 1L', preco: '5,49', z: 0.8, topo: 12, giro: -6, atraso: 1.5, dur: 2.2 },
  { nome: 'ACUCAR 1KG', preco: '4,79', z: -0.55, topo: 20, giro: 3, atraso: 0.0, dur: 6.2 },
  { nome: 'DETERGENTE', preco: '3,29', z: -0.62, topo: 68, giro: -3, atraso: 1.1, dur: 6.6 },
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

/* O odômetro: cada coluna é uma roda. Numa roda de verdade o algarismo fica PARADO e só
   gira no instante do "vai um" — por isso a fração de giro só entra nos últimos 10 % da
   volta da casa de baixo. Sem isso o número fica sempre meio entre dois algarismos e não
   se lê, que foi o que o primeiro teste mostrou. */
const CASAS = [10000, 1000, 100, 10, 1]; // em centavos: centena, dezena, unidade, décimo, centavo
const DIGITOS = '01234567890123456789'.split('');
const tambor = (i) => `<span class="tambor"><span class="rolo" data-col="${i}">${DIGITOS.map((d) => `<i>${d}</i>`).join('')}</span></span>`;

/* O total verdadeiro do carrinho da cena 3: R$ 139,20. Sobe desacelerando, mas os
   centavos nunca param de girar — ninguém sabe onde isso vai parar. */
const ALVO = 13920;
const valorEm = (t, ease, prog) => ALVO * ease.outSine(prog(t, 0.1, 2.4));

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
        <h2 class="frase">Você sabe quanto já deu?</h2>
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
    window.legendaFilme(api, el, t);
    const { ease, prog, lerp, clamp } = api;

    // As etiquetas atravessam o quadro; as da frente, grandes e rápidas.
    el.movs.forEach((mov, i) => {
      const e = ETIQUETAS[i];
      const frente = e.z > 0;
      const p = clamp((t - e.atraso) / e.dur, 0, 1);
      api.set(mov, {
        x: lerp(frente ? 86 : 62, frente ? -92 : -62, p),
        r: e.giro + lerp(-3, 3, p),
        s: frente ? lerp(1.1, 1.17, p) : 0.58,
        o: (frente ? 0.96 : 0.42) * ease.outQuart(prog(t, e.atraso, e.atraso + 0.2)),
      });
    });

    // O odômetro sobe. A velocidade de cada roda vira o desfoque vertical dela.
    const v = valorEm(t, ease, prog);
    const dt = 1 / 30;
    const vel = Math.abs(v - valorEm(t - dt, ease, prog)) / dt; // centavos por segundo
    el.rolos.forEach((rolo, i) => {
      const casa = CASAS[i];
      const volta = v / casa;
      const anda = Math.min(1, (vel / casa) * 0.9); // esta roda ainda está em movimento?
      const carrega = Math.max(0, (volta % 1) - 0.9) * 10 * anda; // só no "vai um", e só andando
      const pos = ((Math.floor(volta) % 10) + carrega + 10) % 10;
      api.set(rolo, { y: -pos * el.passo, blur: Math.min(0.085, (vel / casa) * 0.02) });
    });
    const some = ease.inCubic(prog(t, 4.7, 5.1));
    api.set(el.$('.caixa'), { o: lerp(1, 0.1, some), s: lerp(1, 0.96, some) });

    // A pergunta sai do desfoque, palavra a palavra, e fica.
    api.tipo.focar(t, el.palavras, { inicio: 0.95, cascata: 0.045 });

    el.cn.quadro(t, { zoom: lerp(1, 1.05, ease.outSine(prog(t, 0, 5.1))) });
  },
});
