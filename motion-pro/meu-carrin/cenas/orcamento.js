/* orcamento — "O total em tempo real" · 5,2 s
   Ideia: cada produto que entra empurra o total para cima, até a barra mudar de cor e o
   aviso subir. A tela não é um print: ela funciona (o total soma, a barra enche, o aviso
   sobe), com os mesmos números e a mesma frase do aplicativo.
   v2: cada produto que entra agora larga uma etiqueta verde de "+ R$ x,xx" que sobe do
   total e esfria — é o que faz o espectador LER a relação entre o produto e a conta, em vez
   de só ver um número mudando. Os produtos ganharam ar entre eles e o aviso ganhou hold.
   Saída: o cartão sobe e dá lugar à etiqueta. */
const ORCAMENTO = 17000;
const ATENCAO = 75;
const ITENS = [
  { nome: 'Arroz 5 kg', det: '1 un × R$ 28,90', valor: 2890, t: 0.6 },
  { nome: 'Café 500 g', det: '2 un × R$ 22,90', valor: 4580, t: 1.26 },
  { nome: 'Leite integral 1 L', det: '6 un × R$ 5,49', valor: 3294, t: 1.74 },
  { nome: 'Peito de frango 1 kg', det: '1 un × R$ 16,90', valor: 1690, t: 2.18 },
  { nome: 'Açúcar 1 kg', det: '1 un × R$ 4,79', valor: 479, t: 2.58 },
  { nome: 'Detergente 500 ml', det: '3 un × R$ 3,29', valor: 987, t: 2.94 },
];
const brl = (c) => 'R$ ' + (c / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');

Motion.cena('orcamento', {
  render: (c) => `
    ${c.cenario('estudio', { detalhes: { cantos: true } })}
    <div class="luz-w" data-z="-0.5"><div class="luz"></div></div>
    <div class="cartao-w" data-z="0.08">
      <div class="cartao-mov">
        <div class="cartao">
          <div class="topo">
            <span class="rotulo">COMPRA EM ANDAMENTO</span>
            <div class="total-l"><div class="total">R$ 0,00</div><i class="delta"></i></div>
            <div class="sub"><span class="conta">nenhum produto</span><span>Supermercado Central</span></div>
            <div class="barra"><i class="barra-p"></i></div>
            <div class="sub"><span>Orçamento</span><span class="saldo">R$ 170,00</span></div>
          </div>
          <div class="aviso-w">
            <div class="aviso">
              <b>Atenção ao orçamento</b>
              <span class="aviso-txt">Você já gastou R$ 139,20 dos R$ 170,00 disponíveis (81%). Restam R$ 30,80.</span>
            </div>
          </div>
          <ul class="itens">
            ${ITENS.map((i) => `<li><div class="li-in"><span><b>${i.nome}</b><small>${i.det}</small></span><em>${brl(i.valor)}</em></div></li>`).join('')}
          </ul>
        </div>
      </div>
    </div>
    <div class="texto-w" data-z="0.2">
      <h2 class="frase">Cada produto entra na conta</h2>
      <p class="apoio">o total, o saldo e a porcentagem mudam na hora</p>
    </div>
    ${c.poeira({ n: 12, semente: 11 })}`,

  montar(el, api) {
    el.palavras = api.tipo.dividir(el.$('.frase'), { por: 'palavra' });
    el.apoio = api.tipo.dividir(el.$('.apoio'), { por: 'palavra' });
    el.lis = el.$$('.itens li');
    el.lisIn = el.$$('.itens .li-in');
    el.total = el.$('.total');
    el.conta = el.$('.conta');
    el.saldo = el.$('.saldo');
    el.delta = el.$('.delta');
    el.cn = api.cenario.montar(el, { abertura: 0.8, deriva: 0.7 });
  },

  quadro(t, el, api) {
    const { ease, prog, lerp, clamp } = api;

    // O cartão entra de baixo com mola curta.
    const entra = ease.outBack(1.1)(prog(t, 0.1, 0.8));
    api.set(el.$('.cartao-mov'), { y: lerp(14, 0, entra), o: ease.outCubic(prog(t, 0.1, 0.5)), s: lerp(0.94, 1, entra) });

    // Os produtos caem na lista em accelerando; o total soma a cada um.
    let gasto = 0;
    let n = 0;
    el.lis.forEach((li, i) => {
      const it = ITENS[i];
      const p = ease.outExpo(prog(t, it.t, it.t + 0.34));
      // A linha não reserva espaço antes de existir: o cartão CRESCE a cada produto, como a
      // lista do aplicativo. Antes a metade de baixo ficava branca e vazia, esperando.
      api.set(li, { style: { gridTemplateRows: `${ease.outQuart(prog(t, it.t, it.t + 0.3))}fr` } });
      api.set(el.lisIn[i], { y: lerp(3.2, 0, p), o: p, s: lerp(0.97, 1, p) });
      if (t >= it.t + 0.12) { gasto += it.valor; n += 1; }
    });

    const usado = Math.floor((gasto * 100) / ORCAMENTO);
    const resta = Math.max(0, ORCAMENTO - gasto);
    el.total.textContent = brl(gasto);
    el.conta.textContent = n === 0 ? 'nenhum produto' : `${n} ${n === 1 ? 'produto' : 'produtos'}`;
    el.saldo.textContent = `${brl(resta)} de ${brl(ORCAMENTO)}`;

    // Um pulo curto no total a cada produto que entra.
    const ultimo = ITENS.filter((i) => t >= i.t + 0.12).pop();
    const pulo = ultimo ? 1 + 0.055 * (1 - ease.outQuart(clamp((t - ultimo.t - 0.12) / 0.3, 0, 1))) : 1;
    api.set(el.total, { s: pulo, origem: '0% 50%' });

    // A cada produto, um "+ R$ x,xx" verde sobe do total e esfria: é a conta sendo feita.
    if (ultimo) {
      const d = clamp((t - ultimo.t - 0.12) / 0.78, 0, 1);
      el.delta.textContent = '+ ' + brl(ultimo.valor);
      api.set(el.delta, { y: lerp(1.6, -1.6, ease.outQuart(d)), o: Math.sin(Math.PI * Math.pow(d, 0.62)), s: lerp(0.86, 1, ease.outBack(2)(clamp(d / 0.3, 0, 1))) });
    } else {
      api.set(el.delta, { o: 0 });
    }

    // A barra enche e vira âmbar ao cruzar 75 %.
    const atencao = gasto * 100 >= ORCAMENTO * ATENCAO;
    api.set(el.$('.barra-p'), {
      style: { width: `${Math.min(100, usado)}%`, background: atencao ? 'var(--ambar)' : 'var(--verde)' },
      bright: atencao ? lerp(1.55, 1, ease.outCubic(prog(t, 2.95, 3.3))) : 1,
    });

    // O aviso sobe como pop-up de verdade, sem desfoque.
    // O aviso não reserva espaço antes de existir: a faixa cresce de 0 e empurra a lista
    // para baixo, como o banner faz no aplicativo. Antes ele deixava um vão branco no meio
    // do cartão durante quase toda a cena.
    const abreAviso = ease.outQuart(prog(t, 3.55, 3.95));
    api.set(el.$('.aviso-w'), { style: { gridTemplateRows: `${abreAviso}fr` } });
    const av = ease.outBack(1.3)(prog(t, 3.6, 4.1));
    api.set(el.$('.aviso'), { y: lerp(6, 0, av), o: ease.outCubic(prog(t, 3.6, 3.9)), s: lerp(0.96, 1, av) });

    // O texto ao lado, depois que a câmera abre.
    api.tipo.focar(t, el.palavras, { inicio: 1.5, cascata: 0.045 });
    api.tipo.focar(t, el.apoio, { inicio: 1.95, cascata: 0.03 });

    // A câmera começa num close do total e abre até o plano do cartão inteiro.
    const abre = ease.outQuart(prog(t, 0.2, 1.5));
    const tremor = api.tremor(t, 3.65);
    el.cn.quadro(t, {
      zoom: lerp(1.6, 1, abre) * lerp(1, 1.03, ease.outSine(prog(t, 1.5, 5.2))),
      x: lerp(17, 0, abre) + tremor.x,
      y: lerp(-10, 0, abre) + tremor.y,
    });
  },
});
