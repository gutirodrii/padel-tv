/* Pádel TV — mini cliente de Premier Padel en Red Bull TV para Samsung Tizen 5.0.
   ES5 a propósito: el motor web de las teles de 2019 no entiende sintaxis moderna. */
(function () {
  'use strict';

  var API = 'https://tv-api.redbull.com/collections/v5.3/rbtv/es_ES/es/';
  var PLAY = 'https://play.redbull.com/main/v1/rbtv/es_ES/es/personal_computer/http/';
  var IMG = 'https://resources.redbull.tv/';
  var COLLECTIONS = {
    live: '50cba44e-66b9-4f80-83ce-da9ae7f2ecfc',                        // "Live Now"
    padel: 'rrn:content:collections:cb70f649-2b42-4881-91a2-bab41eb730ce', // "Todo sobre Pádel"
    upcoming: 'rrn:content:collections:8a6da843-02e0-48ba-8caa-6ea2f02cab4a' // "Próximos eventos en vivo"
  };
  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27,
              PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413 };
  var DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

  var rows = [];          // [{title, items:[...]}]
  var focus = { r: 0, c: 0 };
  var playing = null;
  var osdTimer = null;

  function $(id) { return document.getElementById(id); }

  function setStatus(t) { $('status').textContent = t || ''; }

  function getJSON(url, cb) {
    var x = new XMLHttpRequest();
    x.open('GET', url, true);
    x.timeout = 15000;
    x.onload = function () {
      var j = null;
      try { j = JSON.parse(x.responseText); } catch (e) {}
      cb(x.status === 200 ? j : null);
    };
    x.onerror = x.ontimeout = function () { cb(null); };
    x.send();
  }

  function isPremier(c) {
    return /premier\s*padel/i.test((c.title || '') + ' ' + (c.subheading || ''));
  }

  function startMs(c) { return c.start_time ? Date.parse(c.start_time) : 0; }

  function fmtDate(ms) {
    var d = new Date(ms);
    var hh = ('0' + d.getHours()).slice(-2), mm = ('0' + d.getMinutes()).slice(-2);
    return DAYS[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1) + ' · ' + hh + ':' + mm;
  }

  function buildRows(data) {
    var now = Date.now();
    var seen = {};
    var live = [], soon = [], replays = [];

    function add(list, c) { if (!seen[c.id]) { seen[c.id] = true; list.push(c); } }

    (data.live || []).forEach(function (c) {
      if (isPremier(c) && c.id.indexOf('live-videos') > -1) { c._state = 'live'; add(live, c); }
    });
    (data.padel || []).forEach(function (c) {
      if (!isPremier(c) || seen[c.id]) return;
      var s = startMs(c);
      if (c.id.indexOf('live-videos') > -1 && s > now) { c._state = 'soon'; add(soon, c); }
      else if (c.playable) { c._state = 'vod'; add(replays, c); }
    });
    (data.upcoming || []).forEach(function (c) {
      if (isPremier(c) && startMs(c) > now) { c._state = 'event'; add(soon, c); }
    });
    soon.sort(function (a, b) { return startMs(a) - startMs(b); });

    var out = [];
    if (live.length) out.push({ title: 'En directo', items: live });
    out.push({ title: 'Próximamente', items: soon });
    out.push({ title: 'Partidos y resúmenes', items: replays });
    return out;
  }

  function load() {
    setStatus('Cargando…');
    var data = {}, pending = 0;
    Object.keys(COLLECTIONS).forEach(function (k) {
      pending++;
      getJSON(API + COLLECTIONS[k], function (j) {
        data[k] = (j && j.cards) || [];
        if (--pending === 0) {
          var keepId = current() && current().id;
          rows = buildRows(data);
          restoreFocus(keepId);
          render();
          setStatus('Actualizado ' + fmtDate(Date.now()).split(' · ')[1]);
        }
      });
    });
  }

  function current() {
    var row = rows[focus.r];
    return row && row.items[focus.c];
  }

  function restoreFocus(id) {
    focus = { r: 0, c: 0 };
    if (!id) return;
    for (var r = 0; r < rows.length; r++)
      for (var c = 0; c < rows[r].items.length; c++)
        if (rows[r].items[c].id === id) { focus = { r: r, c: c }; return; }
  }

  function badge(c) {
    if (c._state === 'live') return '<span class="badge">● EN VIVO</span>';
    if (c._state === 'soon' || c._state === 'event') return '<span class="badge soon">' + fmtDate(startMs(c)) + '</span>';
    return '';
  }

  function esc(s) { return String(s || '').replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }

  function render() {
    var html = '';
    rows.forEach(function (row, r) {
      html += '<div class="row"><h2>' + esc(row.title) + '</h2><div class="cards"><div class="track" id="track' + r + '">';
      if (!row.items.length) html += '<div class="empty">Nada por ahora</div>';
      row.items.forEach(function (c, i) {
        var img = IMG + c.id + '/rbtv_display_art_landscape/c_fill,w_440,h_248,q_70';
        html += '<div class="card' + (r === focus.r && i === focus.c ? ' focus' : '') + '" id="c' + r + '_' + i + '">' +
          '<div class="img" style="background-image:url(\'' + img + '\')">' + badge(c) + '</div>' +
          '<div class="t">' + esc(c._state === 'event' && c.subheading ? c.title + ' · ' + c.subheading : c.title) + '</div></div>';
      });
      html += '</div></div></div>';
    });
    $('rows').innerHTML = html;
    scrollRows();
  }

  function scrollRows() {
    rows.forEach(function (row, r) {
      var t = $('track' + r);
      if (!t) return;
      var c = r === focus.r ? focus.c : 0;
      var x = Math.max(0, c - 2) * 468;
      t.style.webkitTransform = t.style.transform = 'translateX(' + (-x) + 'px)';
    });
    // Mostrar como mucho 3 filas: desplazar la lista si la fila enfocada queda abajo.
    $('rows').style.marginTop = (focus.r > 1 ? -(focus.r - 1) * 400 : 0) + 'px';
  }

  function moveFocus(dr, dc) {
    if (!rows.length) return;
    var old = $('c' + focus.r + '_' + focus.c);
    var r = focus.r, c = focus.c;
    if (dr) {
      var nr = r + dr;
      while (nr >= 0 && nr < rows.length && !rows[nr].items.length) nr += dr;
      if (nr < 0 || nr >= rows.length) return;
      r = nr; c = Math.min(c, rows[r].items.length - 1);
    } else {
      c = Math.max(0, Math.min(rows[r].items.length - 1, c + dc));
    }
    focus = { r: r, c: c };
    if (old) old.className = 'card';
    var el = $('c' + r + '_' + c);
    if (el) el.className = 'card focus';
    scrollRows();
  }

  function showOsd(text, sub, ms) {
    var o = $('osd');
    o.innerHTML = esc(text) + (sub ? '<small>' + esc(sub) + '</small>' : '');
    o.style.display = 'block';
    clearTimeout(osdTimer);
    if (ms) osdTimer = setTimeout(function () { o.style.display = 'none'; }, ms);
  }

  function play(c) {
    if (!c) return;
    if (c._state === 'event' || (c._state === 'soon' && startMs(c) > Date.now() + 10 * 60000)) {
      setStatus('«' + c.title + '» empieza el ' + fmtDate(startMs(c)) + '. Vuelve a esa hora.');
      return;
    }
    playing = c;
    var v = $('video');
    $('home').style.display = 'none';
    $('player').style.display = 'block';
    showOsd(c.title, c._state === 'live' ? 'En directo · OK pausa · Volver para salir' : 'OK pausa · ←→ 30 s · Volver para salir', 5000);
    v.onerror = function () { showOsd('No se ha podido reproducir', 'Pulsa Volver', 0); };
    v.src = PLAY + c.id + '.m3u8';
    v.load();
    var p = v.play();
    if (p && p.catch) p.catch(function () {});
  }

  function stop() {
    var v = $('video');
    v.pause();
    v.removeAttribute('src');
    v.load();
    playing = null;
    $('player').style.display = 'none';
    $('home').style.display = 'block';
    load();
  }

  function togglePause() {
    var v = $('video');
    if (v.paused) { v.play(); showOsd(playing.title, 'Reproduciendo', 2000); }
    else { v.pause(); showOsd(playing.title, 'En pausa', 0); }
  }

  function exitApp() {
    try { tizen.application.getCurrentApplication().exit(); } catch (e) {}
  }

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (playing) {
      var v = $('video');
      if (k === KEY.BACK || k === KEY.ESC || k === KEY.STOP) stop();
      else if (k === KEY.ENTER || k === KEY.PLAYPAUSE) togglePause();
      else if (k === KEY.PLAY) { v.play(); }
      else if (k === KEY.PAUSE) { v.pause(); }
      else if ((k === KEY.LEFT || k === KEY.RIGHT) && playing._state !== 'live') {
        try { v.currentTime = Math.max(0, v.currentTime + (k === KEY.RIGHT ? 30 : -30)); } catch (er) {}
        showOsd(playing.title, (k === KEY.RIGHT ? '+30 s' : '−30 s'), 1500);
      } else if (k === KEY.UP || k === KEY.DOWN) showOsd(playing.title, '', 3000);
      e.preventDefault();
      return;
    }
    if (k === KEY.LEFT) moveFocus(0, -1);
    else if (k === KEY.RIGHT) moveFocus(0, 1);
    else if (k === KEY.UP) moveFocus(-1, 0);
    else if (k === KEY.DOWN) moveFocus(1, 0);
    else if (k === KEY.ENTER) play(current());
    else if (k === KEY.BACK || k === KEY.ESC) exitApp();
    e.preventDefault();
  });

  try {
    ['MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop'].forEach(function (n) { tizen.tvinputdevice.registerKey(n); });
  } catch (e) {}

  load();
  setInterval(function () { if (!playing) load(); }, 60000);
})();
