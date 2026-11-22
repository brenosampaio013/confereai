// Meu Carrin — comportamento da landing page. Sem bibliotecas.
(function () {
  'use strict';

  var semMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var brl = function (c) { return (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };

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
    var relogios = [];

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
      var esq = document.createElement('div');
      esq.innerHTML = '<span>' + item.nome + '</span><small>' + item.detalhe + '</small>';
      var dir = document.createElement('b');
      dir.textContent = brl(item.valor);
      li.appendChild(esq);
      li.appendChild(dir);
      if (animar && !semMovimento) li.className = 'entrando';
      elLista.insertBefore(li, elLista.firstChild);
    }

    function tocar(animar) {
      relogios.forEach(clearTimeout);
      relogios = [];
      elLista.innerHTML = '';
      pintar(0, 0, false);
      if (!animar || semMovimento) {
        var total = 0;
        ITENS.forEach(function (i) { total += i.valor; linha(i, false); });
        pintar(total, ITENS.length, false);
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

  /* ---------- Revelação dos blocos na rolagem ---------- */
  var alvos = document.querySelectorAll('.revela');
  if ('IntersectionObserver' in window && !semMovimento) {
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('visivel');
        obs.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    alvos.forEach(function (a) { obs.observe(a); });
  } else {
    alvos.forEach(function (a) { a.classList.add('visivel'); });
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

  /* ---------- Lista de espera do plano Família (ainda em construção) ---------- */
  var form = document.getElementById('lista-espera');
  if (form) {
    var SUPABASE_URL = '__SUPABASE_URL__';
    var SUPABASE_KEY = '__SUPABASE_KEY__';
    var resposta = document.getElementById('lista-resposta');
    var botao = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var email = form.querySelector('#email-espera').value.trim();
      if (!email) return;
      botao.disabled = true;
      resposta.style.color = '';
      resposta.textContent = 'Enviando…';
      fetch(SUPABASE_URL + '/rest/v1/rpc/join_waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY },
        body: JSON.stringify({ p_email: email, p_origem: 'landing-familia' })
      }).then(function (r) {
        if (!r.ok) throw new Error(String(r.status));
        resposta.style.color = '#0A6B42';
        resposta.textContent = 'Pronto. Avisamos nesse e-mail quando o Família abrir.';
        form.querySelector('#email-espera').value = '';
      }).catch(function () {
        resposta.style.color = '#A12626';
        resposta.textContent = 'Não consegui registrar agora. Tente de novo em instantes.';
      }).finally(function () { botao.disabled = false; });
    });
  }
})();
