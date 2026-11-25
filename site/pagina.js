// Meu Carrin — comportamento da landing page. Sem bibliotecas.
(function () {
  'use strict';

  var semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var brl = function (c) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };

  /* ---------- Medição do funil: só contagem, sem dado pessoal ---------- */
  // Só a página publicada mede (no computador de quem desenvolve e nos testes, nada sai daqui).
  // Envia o nome do evento e o caminho da página, sem consulta, sem de onde a pessoa veio.
  var MEDE = location.hostname === '__SITE_HOST__' || location.hostname === 'www.__SITE_HOST__';
  function registrar(evento, dados) {
    if (!MEDE || !window.fetch) return;
    try {
      fetch('__SUPABASE_URL__/rest/v1/rpc/registrar_evento', {
        method: 'POST',
        keepalive: true,
        referrerPolicy: 'no-referrer',
        headers: { 'Content-Type': 'application/json', apikey: '__SUPABASE_KEY__', Authorization: 'Bearer __SUPABASE_KEY__' },
        body: JSON.stringify({ p_evento: evento, p_origem: 'site', p_dados: dados || {} })
      }).catch(function () {});
    } catch (e) { /* medir nunca atrapalha a página */ }
  }
  var caminho = location.pathname.toLowerCase();
  registrar('page_view', /^\/[a-z0-9\/_-]*$/.test(caminho) && caminho.length <= 60 ? { pagina: caminho } : {});

  var secaoPlanos = document.getElementById('planos');
  if (secaoPlanos && 'IntersectionObserver' in window) {
    var viuPlanos = new IntersectionObserver(function (entradas) {
      if (entradas.some(function (e) { return e.isIntersecting; })) {
        registrar('pricing_viewed', {});
        viuPlanos.disconnect();
      }
    }, { threshold: 0.3 });
    viuPlanos.observe(secaoPlanos);
  }
  document.querySelectorAll('[data-medir]').forEach(function (el) {
    el.addEventListener('click', function () {
      registrar(el.getAttribute('data-medir'), { lugar: el.getAttribute('data-lugar') || 'site' });
    });
  });

  var ano = document.getElementById('ano');
  if (ano) ano.textContent = String(new Date().getFullYear());

  /* ---------- Demonstração: o total subindo, com os números do próprio app ---------- */
  var ORCAMENTO = 17000;
  var ATENCAO = 75; // mesma faixa padrão do aplicativo
  var ITENS = [
    { nome: 'Arroz 5 kg', detalhe: '1 un × R$ 28,90', valor: 2890 },
    { nome: 'Café 500 g', detalhe: '2 un × R$ 22,90', valor: 4580 },
    { nome: 'Leite integral 1 L', detalhe: '6 un × R$ 5,49', valor: 3294 },
    { nome: 'Peito de frango 1 kg', detalhe: '1 un × R$ 16,90', valor: 1690 },
    { nome: 'Açúcar 1 kg', detalhe: '1 un × R$ 4,79', valor: 479 },
    { nome: 'Detergente 500 ml', detalhe: '3 un × R$ 3,29', valor: 987 }
  ];

  var demo = document.getElementById('demo');
  if (demo) {
    var elTotal = document.getElementById('demo-total');
    var elItens = document.getElementById('demo-itens');
    var elBarra = document.getElementById('demo-barra');
    var elSaldo = document.getElementById('demo-saldo');
    var elAviso = document.getElementById('demo-aviso');
    var elAvisoTexto = document.getElementById('demo-aviso-texto');
    var elLista = document.getElementById('demo-lista');
    var elRepetir = document.getElementById('demo-repetir');
    var elRotulo = document.getElementById('demo-rotulo');
    var elSaldoRotulo = document.getElementById('demo-saldo-rotulo');
    var relogios = [];
    // O item que o caixa cobra diferente da etiqueta — é o que o aplicativo acha.
    var DIVERGENTE = 1; // café
    var COBRADO = 4980; // 2 un × R$ 24,90 (a etiqueta dizia R$ 22,90)

    function pintar(gasto, quantos, animar) {
      var usado = Math.floor((gasto * 100) / ORCAMENTO);
      var resta = Math.max(0, ORCAMENTO - gasto);
      elTotal.textContent = brl(gasto);
      elItens.textContent = quantos === 0 ? 'nenhum produto registrado'
        : quantos + (quantos === 1 ? ' produto registrado' : ' produtos registrados');
      elBarra.style.width = Math.min(100, usado) + '%';
      elSaldo.textContent = brl(resta) + ' de ' + brl(ORCAMENTO);
      var atencao = gasto * 100 >= ORCAMENTO * ATENCAO;
      demo.setAttribute('data-nivel', atencao ? 'atencao' : 'ok');
      if (atencao) {
        elAvisoTexto.textContent = 'Você já gastou ' + brl(gasto) + ' dos ' + brl(ORCAMENTO)
          + ' disponíveis (' + usado + '%). Restam ' + brl(resta) + '.';
        elAviso.hidden = false;
      } else {
        elAviso.hidden = true;
      }
      if (!animar) elBarra.style.transition = 'none';
      else elBarra.style.transition = '';
    }

    function linha(item, animar) {
      var li = document.createElement('li');
      li.setAttribute('data-item', item.nome);
      var esq = document.createElement('div');
      esq.innerHTML = '<span>' + item.nome + '</span><small>' + item.detalhe + '</small>';
      var dir = document.createElement('b');
      dir.textContent = brl(item.valor);
      li.appendChild(esq);
      li.appendChild(dir);
      if (animar && !semMovimento) li.className = 'entrando';
      elLista.insertBefore(li, elLista.firstChild);
    }

    /** Segundo ato: o cupom é conferido e a divergência aparece. */
    function conferir() {
      var carrinho = 0;
      ITENS.forEach(function (i) { carrinho += i.valor; });
      var diferenca = COBRADO - ITENS[DIVERGENTE].valor;
      var cupom = carrinho + diferenca;

      elRotulo.textContent = 'Conferência do cupom';
      elTotal.textContent = brl(cupom);
      elItens.textContent = 'cobrado no caixa';
      elSaldoRotulo.textContent = 'No seu carrinho';
      elSaldo.textContent = brl(carrinho);
      elBarra.style.width = '100%';
      demo.setAttribute('data-nivel', 'atencao');
      elAvisoTexto.textContent = '1 ponto a revisar: o ' + ITENS[DIVERGENTE].nome.toLowerCase()
        + ' foi cobrado a R$ 24,90, e a etiqueta dizia R$ 22,90. São ' + brl(diferenca) + ' a mais.';
      elAviso.hidden = false;

      var alvo = elLista.querySelector('[data-item="' + ITENS[DIVERGENTE].nome + '"]');
      if (alvo) {
        alvo.className = 'divergente';
        alvo.querySelector('small').textContent = 'cobrado 2 un × R$ 24,90, etiqueta R$ 22,90';
        alvo.querySelector('b').textContent = brl(COBRADO);
        elLista.insertBefore(alvo, elLista.firstChild);
      }
    }

    function restaurar() {
      elRotulo.textContent = 'Compra em andamento';
      elSaldoRotulo.textContent = 'Orçamento';
      elItens.textContent = 'nenhum produto registrado';
    }

    function tocar(animar) {
      relogios.forEach(clearTimeout);
      relogios = [];
      elLista.innerHTML = '';
      restaurar();
      pintar(0, 0, false);
      if (!animar || semMovimento) {
        var total = 0;
        ITENS.forEach(function (i) { total += i.valor; linha(i, false); });
        pintar(total, ITENS.length, false);
        conferir();
        return;
      }
      var acumulado = 0;
      ITENS.forEach(function (item, i) {
        relogios.push(setTimeout(function () {
          acumulado += item.valor;
          linha(item, true);
          pintar(acumulado, i + 1, true);
        }, 700 + i * 950));
      });
      // Depois do último produto, o caixa passa o cupom.
      relogios.push(setTimeout(conferir, 700 + ITENS.length * 950 + 1400));
    }

    if (elRepetir) elRepetir.addEventListener('click', function () { tocar(true); });

    if ('IntersectionObserver' in window) {
      var olho = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
          if (e.isIntersecting) { tocar(true); olho.disconnect(); }
        });
      }, { threshold: 0.35 });
      olho.observe(demo);
    } else {
      tocar(false);
    }
  }

  /* ---------- O filme ---------- */
  var filme = document.getElementById('video-filme');
  var play = document.getElementById('filme-play');
  if (filme && play) {
    play.addEventListener('click', function () {
      play.hidden = true;
      filme.play();
    });
    filme.addEventListener('pause', function () { if (filme.currentTime === 0) play.hidden = false; });
    filme.addEventListener('ended', function () { play.hidden = false; filme.load(); });
  }

})();
