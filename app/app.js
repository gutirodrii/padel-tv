/* Pádel TV — mini cliente de Premier Padel en Red Bull TV para Samsung Tizen 5.0.
   ES5 a propósito: el motor web de las teles de 2019 no entiende sintaxis moderna. */
(function () {
  'use strict';

  var API = 'https://tv-api.redbull.com/';
  var COLL = API + 'collections/v5.3/rbtv/es_ES/es/';
  var PROD = API + 'products/v5.3/rbtv/es_ES/es/';
  var PLAY = 'https://play.redbull.com/main/v1/rbtv/es_ES/es/personal_computer/http/';
  var IMG = 'https://resources.redbull.tv/';
  var COLLECTIONS = {
    live: '50cba44e-66b9-4f80-83ce-da9ae7f2ecfc',                        // "Live Now"
    padel: 'rrn:content:collections:cb70f649-2b42-4881-91a2-bab41eb730ce', // "Todo sobre Pádel"
    upcoming: 'rrn:content:collections:8a6da843-02e0-48ba-8caa-6ea2f02cab4a' // "Próximos eventos en vivo"
  };
  var MAX_TOURNAMENTS = 10;
  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27,
              PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413, REW: 412, FF: 417 };
  var DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

  var rows = [];          // [{title, items:[...]}]
  var focus = { r: 0, c: 0 };
  var playing = null;
  var playlistOf = {};    // id de vídeo -> id de la lista de rondas de su torneo (no cambia, se cachea)

  // Reproductor: barra de controles en pantalla (el botón Volver del mando no llega en TizenBrew).
  var btns = [];
  var btnFocus = 0;
  var ctrlTimer = null;
  var tickTimer = null;
  var message = '';
  var hls = null;         // hls.js: deja elegir la pista de audio (el reproductor nativo pone siempre el inglés)
  var LANG_NAMES = { es: 'Español', en: 'English', de: 'Deutsch' };
  var audioLang = 'es';
  try { audioLang = localStorage.getItem('padeltv.audio') || 'es'; } catch (e) {}

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

  // Pide varias URLs a la vez y devuelve los resultados en el mismo orden.
  function getAll(urls, cb) {
    var out = [], pending = urls.length;
    if (!pending) { cb(out); return; }
    urls.forEach(function (u, i) {
      getJSON(u, function (j) { out[i] = j; if (--pending === 0) cb(out); });
    });
  }

  function isPremier(c) {
    return /premier\s*padel/i.test((c.title || '') + ' ' + (c.subheading || ''));
  }

  function isLiveVideo(c) { return c.id.indexOf('live-videos') > -1; }

  function startMs(c) { return c.start_time ? Date.parse(c.start_time) : 0; }

  function fmtDate(ms) {
    var d = new Date(ms);
    var hh = ('0' + d.getHours()).slice(-2), mm = ('0' + d.getMinutes()).slice(-2);
    return DAYS[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1) + ' · ' + hh + ':' + mm;
  }

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    var h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + sec).slice(-2);
  }

  // "Cuartos, Pista Central: Kuwait Major Premier Padel" -> ["Cuartos, Pista Central", "Kuwait Major Premier Padel"]
  function splitTitle(t) {
    var p = String(t || '').split(/\s[–-]\s|:\s/);
    if (p.length < 2) return [t, t];
    return [p[0].trim(), p.slice(1).join(' – ').trim()];
  }

  function buildRows(data, tournaments) {
    var now = Date.now();
    var liveIds = {};
    var live = [], soon = [], extras = [];
    var inTournament = {};

    (data.live || []).forEach(function (c) {
      if (isPremier(c) && isLiveVideo(c)) { c._state = 'live'; liveIds[c.id] = true; live.push(c); }
    });

    var trows = [];
    tournaments.forEach(function (cards) {
      var items = [];
      cards.forEach(function (c) {
        if (!c.playable && !(startMs(c) > now)) return;
        inTournament[c.id] = true;
        c._state = liveIds[c.id] ? 'live' : (startMs(c) > now ? 'soon' : 'vod');
        c._label = splitTitle(c.title)[0] + (c.start_time ? ' · ' + fmtDate(startMs(c)).split(' · ')[0] : '');
        items.push(c);
      });
      if (!items.length) return;
      items.sort(function (a, b) { return startMs(a) - startMs(b); });
      var last = items[items.length - 1];
      trows.push({ title: splitTitle(last.title)[1], items: items, _t: startMs(last) });
    });
    trows.sort(function (a, b) { return b._t - a._t; });

    (data.padel || []).forEach(function (c) {
      if (inTournament[c.id] || liveIds[c.id]) return;
      var s = startMs(c);
      if (isLiveVideo(c) && s > now) { if (isPremier(c)) { c._state = 'soon'; soon.push(c); } }
      else if (c.playable && !isLiveVideo(c)) { c._state = 'vod'; extras.push(c); }
    });
    (data.upcoming || []).forEach(function (c) {
      if (isPremier(c) && startMs(c) > now) { c._state = 'event'; soon.push(c); }
    });
    soon.sort(function (a, b) { return startMs(a) - startMs(b); });

    var out = [];
    if (live.length) out.push({ title: 'En directo', items: live });
    if (soon.length) out.push({ title: 'Próximamente', items: soon });
    out = out.concat(trows);
    out.push({ title: 'Resúmenes y más', items: extras });
    return out;
  }

  function load() {
    setStatus('Cargando…');
    var keys = Object.keys(COLLECTIONS);
    getAll(keys.map(function (k) { return COLL + COLLECTIONS[k]; }), function (res) {
      var data = {};
      keys.forEach(function (k, i) { data[k] = (res[i] && res[i].cards) || []; });

      // Vídeos de Premier Padel de los que hay que averiguar a qué torneo pertenecen.
      var videos = [];
      (data.live || []).concat(data.padel || []).forEach(function (c) {
        if (isPremier(c) && isLiveVideo(c) && videos.indexOf(c.id) < 0) videos.push(c.id);
      });
      var unknown = videos.filter(function (id) { return !(id in playlistOf); });

      getAll(unknown.map(function (id) { return PROD + id; }), function (prods) {
        unknown.forEach(function (id, i) { playlistOf[id] = (prods[i] && prods[i].deeplink_playlist) || ''; });

        var lists = [];
        function addList(p) { if (p && lists.indexOf(p) < 0 && lists.length < MAX_TOURNAMENTS) lists.push(p); }
        // Torneo en curso: su perfil ya ha empezado pero sigue en "próximos eventos".
        (data.upcoming || []).forEach(function (c) {
          if (isPremier(c) && startMs(c) <= Date.now()) addList(c.id + ':live_programs');
        });
        videos.forEach(function (id) { addList(playlistOf[id]); });

        getAll(lists.map(function (p) { return COLL + p; }), function (colls) {
          var tournaments = colls.map(function (j) { return (j && j.cards) || []; });
          var keepId = current() && current().id;
          rows = buildRows(data, tournaments);
          restoreFocus(keepId);
          render();
          setStatus('Actualizado ' + fmtDate(Date.now()).split(' · ')[1]);
        });
      });
    });
  }

  function current() {
    var row = rows[focus.r];
    return row && row.items[focus.c];
  }

  function restoreFocus(id) {
    focus = { r: 0, c: 0 };
    if (id) {
      for (var r = 0; r < rows.length; r++)
        for (var c = 0; c < rows[r].items.length; c++)
          if (rows[r].items[c].id === id) { focus = { r: r, c: c }; return; }
    }
    while (focus.r < rows.length - 1 && !rows[focus.r].items.length) focus.r++;
  }

  function badge(c) {
    if (c._state === 'live') return '<span class="badge">● EN VIVO</span>';
    if (c._state === 'soon' || c._state === 'event') return '<span class="badge soon">' + fmtDate(startMs(c)) + '</span>';
    return '';
  }

  function esc(s) { return String(s || '').replace(/[&<>"]/g, function (m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]; }); }

  function cardText(c) {
    if (c._label) return c._label;
    if (c._state === 'event' && c.subheading) return c.title + ' · ' + c.subheading;
    return c.title;
  }

  function render() {
    var html = '';
    rows.forEach(function (row, r) {
      html += '<div class="row"><h2>' + esc(row.title) + '</h2><div class="cards"><div class="track" id="track' + r + '">';
      if (!row.items.length) html += '<div class="empty">Nada por ahora</div>';
      row.items.forEach(function (c, i) {
        var img = IMG + c.id + '/rbtv_display_art_landscape/c_fill,w_440,h_248,q_70';
        html += '<div class="card' + (r === focus.r && i === focus.c ? ' focus' : '') + '" id="c' + r + '_' + i + '">' +
          '<div class="img" style="background-image:url(\'' + img + '\')">' + badge(c) + '</div>' +
          '<div class="t">' + esc(cardText(c)) + '</div></div>';
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

  /* ---------- Reproductor ---------- */

  // Tramo que se puede recorrer: el vídeo entero, o la ventana grabada del directo.
  function range() {
    var v = $('video');
    if (isFinite(v.duration) && v.duration > 0) return { s: 0, e: v.duration };
    if (v.seekable && v.seekable.length) return { s: v.seekable.start(0), e: v.seekable.end(v.seekable.length - 1) };
    return null;
  }

  function seekTo(t) {
    var v = $('video'), r = range();
    if (!r) { message = 'Aún no se puede mover, espera unos segundos'; return; }
    var max = playing._state === 'live' ? r.e - 15 : r.e - 1;
    try { v.currentTime = Math.max(r.s, Math.min(max, t)); message = ''; }
    catch (e) { message = 'No se ha podido saltar'; }
  }

  function seekBy(d) { seekTo($('video').currentTime + d); }

  /* ---------- Audio ---------- */

  function audioList() {
    var out = [], v = $('video');
    if (hls) hls.audioTracks.forEach(function (t, i) { out.push({ lang: t.lang, i: i, on: hls.audioTrack === i }); });
    else if (v.audioTracks) for (var i = 0; i < v.audioTracks.length; i++) out.push({ lang: v.audioTracks[i].language, i: i, on: v.audioTracks[i].enabled });
    return out;
  }

  function useAudio(i) {
    var v = $('video');
    if (hls) { if (hls.audioTrack !== i) hls.audioTrack = i; return; }
    if (v.audioTracks) for (var k = 0; k < v.audioTracks.length; k++) v.audioTracks[k].enabled = k === i;
  }

  function selectAudio() {
    audioList().forEach(function (t) { if (t.lang === audioLang && !t.on) useAudio(t.i); });
  }

  function cycleAudio() {
    var list = audioList();
    if (list.length < 2) { message = 'Este vídeo solo tiene un idioma'; return; }
    var cur = 0;
    list.forEach(function (t, k) { if (t.on) cur = k; });
    var next = list[(cur + 1) % list.length];
    audioLang = next.lang;
    try { localStorage.setItem('padeltv.audio', audioLang); } catch (e) {}
    useAudio(next.i);
  }

  function audioLabel() {
    var on = audioList().filter(function (t) { return t.on; })[0];
    var lang = on ? on.lang : audioLang;
    return 'Audio: ' + (LANG_NAMES[lang] || lang || '—');
  }

  function buildButtons() {
    btns = [
      { label: '← Volver', act: stop },
      { label: '−10 min', act: function () { seekBy(-600); } },
      { label: '−1 min', act: function () { seekBy(-60); } },
      { label: '−10 s', act: function () { seekBy(-10); } },
      { id: 'pp', label: 'Pausa', act: togglePause },
      { label: '+10 s', act: function () { seekBy(10); } },
      { label: '+1 min', act: function () { seekBy(60); } },
      { label: '+10 min', act: function () { seekBy(600); } },
      { id: 'aud', label: 'Audio', act: cycleAudio }
    ];
    if (playing._state === 'live') btns.push({ label: 'Ir al directo ⇥', act: function () { seekTo(Infinity); } });
    btnFocus = 4;
    $('btns').innerHTML = btns.map(function (b, i) { return '<span class="btn" id="b' + i + '">' + esc(b.label) + '</span>'; }).join('');
  }

  function updateCtrl() {
    if (!playing) return;
    var v = $('video'), r = range();
    btns.forEach(function (b, i) {
      var el = $('b' + i);
      if (b.id === 'pp') el.textContent = v.paused ? '▶ Seguir' : '❚❚ Pausa';
      if (b.id === 'aud') el.textContent = audioLabel();
      el.className = 'btn' + (i === btnFocus ? ' focus' : '');
    });
    var pct = 0, times = '';
    if (r && r.e > r.s) {
      pct = Math.max(0, Math.min(100, (v.currentTime - r.s) / (r.e - r.s) * 100));
      if (playing._state === 'live') {
        var behind = r.e - v.currentTime;
        times = fmtTime(v.currentTime - r.s) + ' desde el inicio · ' + (behind > 30 ? '−' + fmtTime(behind) + ' respecto al directo' : 'EN DIRECTO');
      } else {
        times = fmtTime(v.currentTime - r.s) + ' / ' + fmtTime(r.e - r.s);
      }
    } else {
      times = v.readyState < 2 ? 'Cargando…' : '';
    }
    $('fill').style.width = pct + '%';
    $('times').textContent = times + (message ? ' · ' + message : '');
  }

  function showCtrl(stay) {
    $('ctrl').style.display = 'block';
    updateCtrl();
    clearTimeout(ctrlTimer);
    if (!stay && !$('video').paused) ctrlTimer = setTimeout(function () { $('ctrl').style.display = 'none'; }, 6000);
  }

  function ctrlVisible() { return $('ctrl').style.display !== 'none'; }

  function play(c) {
    if (!c) return;
    if (c._state === 'event' || (c._state === 'soon' && startMs(c) > Date.now() + 10 * 60000)) {
      setStatus('«' + cardText(c) + '» empieza el ' + fmtDate(startMs(c)) + '. Vuelve a esa hora.');
      return;
    }
    playing = c;
    message = '';
    var v = $('video');
    $('home').style.display = 'none';
    $('player').style.display = 'block';
    $('ctitle').textContent = c.title + (c._state === 'live' ? '  ● EN VIVO' : '');
    buildButtons();
    showCtrl();
    var url = PLAY + c.id + '.m3u8';
    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({ backBufferLength: 90 });
      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, selectAudio);
      hls.on(Hls.Events.MANIFEST_PARSED, function () {
        selectAudio();
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      });
      hls.on(Hls.Events.ERROR, function (ev, d) {
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else { message = 'No se ha podido reproducir'; showCtrl(true); }
      });
      hls.loadSource(url);
      hls.attachMedia(v);
    } else {
      v.onerror = function () { message = 'No se ha podido reproducir'; showCtrl(true); };
      v.onloadedmetadata = selectAudio;
      v.src = url;
      v.load();
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
    }
    clearInterval(tickTimer);
    tickTimer = setInterval(function () { if (ctrlVisible()) updateCtrl(); }, 1000);
  }

  function stop() {
    var v = $('video');
    clearInterval(tickTimer);
    clearTimeout(ctrlTimer);
    v.onerror = v.onloadedmetadata = null;
    if (hls) { hls.destroy(); hls = null; }
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
    if (v.paused) v.play(); else v.pause();
  }

  function exitApp() {
    try { tizen.application.getCurrentApplication().exit(); } catch (e) {}
  }

  function playerKey(k) {
    var v = $('video');
    if (k === KEY.BACK || k === KEY.ESC || k === KEY.STOP) { stop(); return; }
    if (k === KEY.PLAYPAUSE) togglePause();
    else if (k === KEY.PLAY) v.play();
    else if (k === KEY.PAUSE) v.pause();
    else if (k === KEY.REW) seekBy(-60);
    else if (k === KEY.FF) seekBy(60);
    else if (!ctrlVisible()) { /* la primera pulsación solo muestra los controles */ }
    else if (k === KEY.LEFT) btnFocus = Math.max(0, btnFocus - 1);
    else if (k === KEY.RIGHT) btnFocus = Math.min(btns.length - 1, btnFocus + 1);
    else if (k === KEY.ENTER) btns[btnFocus].act();
    if (playing) showCtrl(v.paused);
  }

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    e.preventDefault();
    if (playing) { playerKey(k); return; }
    if (k === KEY.LEFT) moveFocus(0, -1);
    else if (k === KEY.RIGHT) moveFocus(0, 1);
    else if (k === KEY.UP) moveFocus(-1, 0);
    else if (k === KEY.DOWN) moveFocus(1, 0);
    else if (k === KEY.ENTER) play(current());
    else if (k === KEY.BACK || k === KEY.ESC) exitApp();
  });

  try {
    ['MediaPlay', 'MediaPause', 'MediaPlayPause', 'MediaStop', 'MediaRewind', 'MediaFastForward'].forEach(function (n) { tizen.tvinputdevice.registerKey(n); });
  } catch (e) {}

  load();
  setInterval(function () { if (!playing) load(); }, 60000);
})();
