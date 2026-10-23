(function(){
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function(id){ return document.getElementById(id); };
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); };
  function capture(el, id){ try{ el.setPointerCapture(id); }catch(e){} }

  // ---------------------------------------------------------------- data
  // A share link is one Firestore doc (xc_links/{token}) holding a snapshot of just the models chosen for that
  // customer. The page only ever reads that one doc, so a customer can never see models from another link.
  var cfg = window.XC_CONFIG || {};
  function linkToken(){
    var q = new URLSearchParams(location.search).get('l');
    if(q) return q;
    var m = location.pathname.match(/\/xcollab\/([A-Za-z0-9_-]{8,})\/?$/);
    return m ? m[1] : null;
  }
  // Firestore REST values → plain JS
  function dec(v){
    if(!v) return null;
    if('stringValue' in v) return v.stringValue;
    if('integerValue' in v) return +v.integerValue;
    if('doubleValue' in v) return +v.doubleValue;
    if('booleanValue' in v) return v.booleanValue;
    if('nullValue' in v) return null;
    if('timestampValue' in v) return v.timestampValue;
    if('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
    if('mapValue' in v){ var o = {}, f = v.mapValue.fields || {}; for(var k in f) o[k] = dec(f[k]); return o; }
    return null;
  }
  function loadLink(token){
    if(!token || !cfg.projectId) return Promise.resolve(null);
    var url = 'https://firestore.googleapis.com/v1/projects/' + cfg.projectId + '/databases/(default)/documents/xc_links/' + encodeURIComponent(token) + '?key=' + cfg.apiKey;
    return fetch(url, { cache:'no-store', referrerPolicy:'no-referrer' })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(d){ return d && d.fields ? dec({ mapValue:{ fields:d.fields } }) : null; })
      .catch(function(){ return null; });
  }
  function loadSample(){
    // local previews only: xcollab-sample.js is never deployed
    return new Promise(function(resolve){
      var s = document.createElement('script'); s.src = 'xcollab-sample.js';
      s.onload = function(){ resolve(window.XC_SAMPLE || null); }; s.onerror = function(){ resolve(null); };
      document.head.appendChild(s);
    });
  }
  function normalize(m){
    var im = m && m.image; if(!im || !im.url) return null;
    var an = im.anchor || {};
    return { id:m.id, name:m.name || '', artist:m.artist || '', url:im.url, w:+im.width || 1000, h:+im.height || 2000,
      an:{ cx:an.cx == null ? 0.5 : +an.cx, top:an.top == null ? 0 : +an.top, bottom:an.bottom == null ? 1 : +an.bottom } };
  }

  var sample = /[?&]sample(=|&|$)/.test(location.search);
  (sample ? loadSample() : loadLink(linkToken())).then(function(link){
    if(!link || link.active === false){ return init([], link, 'This collection link isn’t active.<br>Ask your Ink Theory contact for a new one.'); }
    var models = (link.models || []).map(normalize).filter(Boolean);
    init(models, link, models.length ? '' : 'Nothing in this collection yet.');
  });

  // ---------------------------------------------------------------- page
  function init(models, link, message){
    var stage = $('stage'), track = $('track'), word = $('word');
    var n = models.length, cur = 0, W = 0, H = 0;
    if(link && link.lede) $('lede').innerHTML = esc(link.lede).replace(/\n/g, '<br>');
    if(message){ $('msg').innerHTML = message; $('msg').hidden = false; $('caption').hidden = true; }

    var els = models.map(function(m, i){
      var el = document.createElement('div'); el.className = 'm'; el.dataset.i = i;
      el.innerHTML = '<img src="' + esc(m.url) + '" alt="' + esc(m.name) + '" draggable="false"' + (i > 1 ? ' loading="lazy"' : '') + '>';
      track.appendChild(el); return el;
    });

    // ---- layout: wordmark spans 82% of the width; models stand on the same floor line at the comp's height
    function tall(){ return W / H < 1; }
    function fitWord(){
      word.style.fontSize = '100px';
      var w = word.getBoundingClientRect().width || 1;
      word.style.fontSize = (100 * W * (tall() ? 0.93 : 0.82) / w) + 'px';
      // the comp's face is wider than Archivo Expanded; a slight vertical squash matches its cap height (≈ 11.4% of the word's width)
      word.style.transform = 'translate(-50%,-50%) scaleY(0.85)';
    }
    var spread = 0;
    function fitModels(){
      var figH = H * (tall() ? 0.56 : 0.778), feet = H * (tall() ? 0.76 : 0.934), maxW = W * (tall() ? 0.6 : 0.95);
      var widest = 0;
      models.forEach(function(m, i){
        var solid = Math.max(0.2, m.an.bottom - m.an.top);
        var ih = figH / solid, iw = ih * m.w / m.h;
        if(iw > maxW){ var k = maxW / iw; iw *= k; ih *= k; }   // wide cutouts never overflow the viewport (and leave the wordmark readable on phones)
        var st = els[i].style;
        st.width = iw + 'px'; st.height = ih + 'px';
        st.left = (W / 2 - m.an.cx * iw) + 'px'; st.top = (feet - m.an.bottom * ih) + 'px';
        widest = Math.max(widest, iw);
      });
      spread = Math.max(W * (tall() ? 1 : 0.68), W / 2 + widest);   // far enough that a neighbour is fully off-screen at rest
    }
    function layout(){ W = stage.clientWidth; H = stage.clientHeight; fitWord(); fitModels(); render(0, false); }

    // ---- carousel: wraps around; the incoming model always enters from the side you're moving toward
    var rel = models.map(function(_, i){ return i; });   // each model's slot relative to the centre
    function wrapRel(i){ var r = ((i - cur) % n + n) % n; return r > n / 2 ? r - n : r; }
    function settleRel(){ for(var i = 0; i < n; i++) rel[i] = wrapRel(i); }
    function setEl(i, t, animate){
      var el = els[i];
      el.classList.toggle('anim', !!animate && !reduced);
      el.style.transform = 'translateX(' + (t * spread) + 'px)';
      el.style.opacity = Math.max(0, 1 - Math.abs(t) * 1.1);
      el.style.zIndex = Math.abs(t) < 0.5 ? 2 : 1;
    }
    function render(dx, animate){
      if(!n) return;
      var f = dx / spread;
      // while dragging, the neighbour on the side being revealed is pulled in (with two models it's the same one either way)
      var side = f < 0 ? 1 : -1, peek = n > 1 ? (cur + side + n) % n : -1;
      for(var i = 0; i < n; i++){
        var r = rel[i];
        if(i === peek && f !== 0) r = side;
        setEl(i, r + f, animate && Math.abs(r) <= 1);
      }
    }
    function caption(){
      var m = models[cur]; if(!m) return;
      var c = $('caption'); c.classList.add('swap');
      setTimeout(function(){
        $('capName').textContent = m.name; $('capArtist').textContent = m.artist;
        $('capCount').textContent = n > 1 ? pad(cur + 1) + ' / ' + pad(n) : '';
        c.classList.remove('swap');
      }, reduced ? 0 : 180);
    }
    function pad(v){ return (v < 10 ? '0' : '') + v; }
    function go(dir, dx){
      if(n < 2){ render(0, true); return; }
      var next = (cur + dir + n) % n;
      if(rel[next] !== dir && !dx){ setEl(next, dir, false); void els[next].offsetWidth; }   // stage the incoming model on the right side first
      var prev = cur; cur = next; settleRel();
      rel[prev] = -dir; rel[cur] = 0;
      render(0, true);
      caption();
    }
    function jump(i){
      if(i === cur || i < 0 || i >= n) return;
      var d = wrapRel(i); go(d > 0 ? 1 : -1, 0);
      if(cur !== i){ cur = i; settleRel(); render(0, false); caption(); }
    }

    // ---- input: drag / swipe, or click the left or right side
    var drag = null, raf = 0;
    stage.addEventListener('pointerdown', function(e){
      if(e.button !== 0 || !n) return;
      drag = { x:e.clientX, y:e.clientY, lastX:e.clientX, lastT:performance.now(), v:0, axis:null, id:e.pointerId, dx:0 };
      capture(stage, e.pointerId);
    });
    stage.addEventListener('pointermove', function(e){
      if(!drag){ hoverSide(e); return; }
      if(e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now();
      if(!drag.axis){ if(Math.abs(dx) > 6 || Math.abs(dy) > 6) drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; else return; }
      if(drag.axis !== 'x') return;
      stage.classList.add('dragging');
      var dt = now - drag.lastT;
      if(dt >= 8){ drag.v = drag.v * 0.6 + ((e.clientX - drag.lastX) / dt) * 0.4; drag.lastX = e.clientX; drag.lastT = now; }
      drag.dx = n > 1 ? dx : dx * 0.25;
      if(!raf) raf = requestAnimationFrame(function(){ raf = 0; if(drag) render(drag.dx, false); });
    });
    function endDrag(e){
      if(!drag || e.pointerId !== drag.id) return;
      var d = drag; drag = null; stage.classList.remove('dragging');
      if(raf){ cancelAnimationFrame(raf); raf = 0; }
      var dx = e.clientX - d.x;
      if(d.axis === 'x'){
        var v = (performance.now() - d.lastT) > 80 ? 0 : d.v;
        var flick = Math.abs(v) > 0.35, dir = flick ? (v < 0 ? 1 : -1) : (dx < 0 ? 1 : -1);
        if(n > 1 && (flick || Math.abs(dx) > W * 0.16)) go(dir, d.dx); else render(0, true);
      } else if(!d.axis && e.type === 'pointerup'){
        if(e.clientX < W * 0.42) go(-1); else if(e.clientX > W * 0.58) go(1);
      }
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    function hoverSide(e){
      if(n < 2 || e.pointerType === 'touch') return;
      stage.classList.toggle('side-l', e.clientX < W * 0.42);
      stage.classList.toggle('side-r', e.clientX > W * 0.58);
    }
    stage.addEventListener('pointerleave', function(){ stage.classList.remove('side-l', 'side-r'); });
    window.addEventListener('keydown', function(e){
      if(e.key === 'Escape') return closePanel();
      if(panel.classList.contains('on')) return;
      if(e.key === 'ArrowRight') go(1); else if(e.key === 'ArrowLeft') go(-1);
    });

    // ---- Artists / Collection / Concept
    var panel = $('panel'), body = $('panelBody'), navBtns = document.querySelectorAll('.nav button');
    function openPanel(kind){
      var html = '';
      if(kind === 'artists'){
        var seen = {}, order = [];
        models.forEach(function(m, i){ var a = m.artist || 'Untitled'; if(!seen[a]){ seen[a] = { first:i, count:0 }; order.push(a); } seen[a].count++; });
        html = '<div class="p-head">Artists</div><ul class="p-list">' + order.map(function(a){
          return '<li><button type="button" data-go="' + seen[a].first + '">' + esc(a) + '<small>' + pad(seen[a].count) + '</small></button></li>';
        }).join('') + '</ul>';
        if(!order.length) html += '<p class="p-concept">No artists in this collection yet.</p>';
      } else if(kind === 'collection'){
        html = '<div class="p-head">Collection — ' + pad(n) + '</div><div class="p-grid">' + models.map(function(m, i){
          return '<button type="button" data-go="' + i + '"><div class="ph"><img src="' + esc(m.url) + '" alt="" loading="lazy"></div><div class="t">' + esc(m.name) + '<span>' + esc(m.artist) + '</span></div></button>';
        }).join('') + '</div>';
      } else {
        var concept = (link && link.concept) || 'Where music, culture, and high fashion intersect.\n\nLimited-edition collections created with artists, designed to turn the connection between artist and fan into something you can wear, feel, and remember.';
        html = '<div class="p-head">Concept</div><p class="p-concept">' + esc(concept) + '</p>';
      }
      body.innerHTML = html;
      panel.scrollTop = 0;
      panel.classList.add('on'); panel.setAttribute('aria-hidden', 'false');
      Array.prototype.forEach.call(navBtns, function(b){ b.classList.toggle('on', b.dataset.panel === kind); });
    }
    function closePanel(){
      panel.classList.remove('on'); panel.setAttribute('aria-hidden', 'true');
      Array.prototype.forEach.call(navBtns, function(b){ b.classList.remove('on'); });
    }
    Array.prototype.forEach.call(navBtns, function(b){
      b.addEventListener('click', function(){ if(b.classList.contains('on')) closePanel(); else openPanel(b.dataset.panel); });
    });
    $('panelX').addEventListener('click', closePanel);
    body.addEventListener('click', function(e){
      var b = e.target.closest('[data-go]'); if(!b) return;
      closePanel(); jump(+b.dataset.go);
    });

    settleRel();
    layout();
    caption();
    window.addEventListener('resize', layout);
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  }
})();
