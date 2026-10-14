(function(){
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var desktop = function(){ return window.matchMedia('(min-width:900px)').matches; };
  function capture(el, id){ try{ el.setPointerCapture(id); }catch(e){} }
  var $ = function(id){ return document.getElementById(id); };

  // ---------------------------------------------------------------- data
  // Live garments come from Firestore (Settings → Artist×Collab). The sample set in
  // collection-data.js is used until the first garment is published, or if the read fails.
  function imgOf(m){ return (m && m.url) ? { url: m.url, width: m.width || 1000, height: m.height || 2000, anchor: m.anchor || null } : null; }
  function hangOf(h){ h = h || {}; return { dy: +(h.dy || 0), scale: +(h.scale || 1), hangerScale: +(h.hangerScale || 1) }; }
  function neckOf(n){ return (n && n.rx > 0 && n.ry > 0) ? { cx: +n.cx, cy: +n.cy, rx: +n.rx, ry: +n.ry, shape: n.shape || 'oval', color: n.color || '#000000', strength: (n.strength == null ? 0.26 : +n.strength) } : null; }
  function normalize(g){
    var front = g.front && (g.front.url || g.front) ? g.front : (g.image ? { url: g.image, width: (g.imageSize||[])[0], height: (g.imageSize||[])[1] } : null);
    if(!front || !front.url) return null;
    return {
      id: g.id, name: g.name || '', artist: g.artist || '', story: g.story || '',
      layout: g.layout === 'canvas' ? 'canvas' : 'garment',
      hang: hangOf(g.hang), hangBack: hangOf(g.hangBack || g.hang),
      model: imgOf(g.model), modelBack: imgOf(g.modelBack), modelHang: hangOf(g.modelHang),
      neck: neckOf(g.neck), neckBack: neckOf(g.neckBack),
      specs: (g.specs || []).map(function(s){ return Array.isArray(s) ? s : [s.label, s.value]; }).filter(function(s){ return s[0] || s[1]; }),
      front: { url: front.url, width: front.width || 920, height: front.height || 2000 },
      back: (g.back && g.back.url) ? { url: g.back.url, width: g.back.width || 920, height: g.back.height || 2000 } : null,
      closeups: (g.closeups || []).map(function(c){ return { label: c.label || 'Closeup', image: c.image && c.image.url ? c.image.url : c.image }; }).filter(function(c){ return c.image; })
    };
  }
  // outline of a neck opening as an SVG path for a w x h box — identical to neckPath() in the admin
  function neckPath(shape, w, h){
    var k = 0.5523;
    if(shape === 'crew'){ var t = h*0.42; return 'M0 '+t+' C0 '+(t*0.3)+' '+(w*0.22)+' 0 '+(w/2)+' 0 C'+(w*0.78)+' 0 '+w+' '+(t*0.3)+' '+w+' '+t+' C'+w+' '+(h*0.82)+' '+(w*0.76)+' '+h+' '+(w/2)+' '+h+' C'+(w*0.24)+' '+h+' 0 '+(h*0.82)+' 0 '+t+' Z'; }
    if(shape === 'square'){ var r = Math.min(w,h)*0.38; return 'M'+r+' 0 H'+(w-r)+' C'+(w-r+r*k)+' 0 '+w+' '+(r-r*k)+' '+w+' '+r+' V'+(h-r)+' C'+w+' '+(h-r+r*k)+' '+(w-r+r*k)+' '+h+' '+(w-r)+' '+h+' H'+r+' C'+(r-r*k)+' '+h+' 0 '+(h-r+r*k)+' 0 '+(h-r)+' V'+r+' C0 '+(r-r*k)+' '+(r-r*k)+' 0 '+r+' 0 Z'; }
    if(shape === 'v'){ var q = w*0.06; return 'M0 0 H'+w+' L'+(w/2+q)+' '+(h-q*0.6)+' Q'+(w/2)+' '+(h+q*0.4)+' '+(w/2-q)+' '+(h-q*0.6)+' Z'; }
    var rx = w/2, ry = h/2;
    return 'M'+rx+' 0 C'+(rx+rx*k)+' 0 '+w+' '+(ry-ry*k)+' '+w+' '+ry+' C'+w+' '+(ry+ry*k)+' '+(rx+rx*k)+' '+h+' '+rx+' '+h+' C'+(rx-rx*k)+' '+h+' 0 '+(ry+ry*k)+' 0 '+ry+' C0 '+(ry-ry*k)+' '+(rx-rx*k)+' 0 '+rx+' 0 Z';
  }
  function rgba(hex, a){ var m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); var n = m ? parseInt(m[1], 16) : 0; return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')'; }

  async function loadLive(){
    var cfg = window.AXC_FIREBASE; if(!cfg || /[?&]sample(=|&|$)/.test(location.search)) return null;   // ?sample forces the built-in set (for previews)
    var timeout = new Promise(function(r){ setTimeout(function(){ r(null); }, 5000); });
    var fetchIt = (async function(){
      var appMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
      var fsMod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
      var app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(cfg);
      var snap = await fsMod.getDocs(fsMod.collection(fsMod.getFirestore(app), 'axc_garments'));
      var rows = []; snap.forEach(function(d){ var v = d.data(); v.id = d.id; rows.push(v); });
      var brand = window.AXC_BRAND || new URLSearchParams(location.search).get('brand') || 'inktheory';   // ?brand= for local previews
      rows = rows.filter(function(r){ return r.active && (r.brand || 'inktheory') === brand; }).sort(function(a, b){ return (a.sortOrder||0) - (b.sortOrder||0); });
      return rows;
    })().catch(function(){ return null; });
    return Promise.race([fetchIt, timeout]);
  }

  var base = window.AXC_COLLECTION || {};

  // The room is mounted before any data arrives so the page never sits empty while Firestore answers.
  function roomFit(W, H){
    var d = desktop();
    var useWide = !d && base.backgroundWide && base.backgroundWideSize;
    var bw = useWide ? base.backgroundWideSize[0] : base.backgroundSize[0];
    var bh = useWide ? base.backgroundWideSize[1] : base.backgroundSize[1];
    var s = d ? Math.min(W/bw, H/bh) : Math.max(W/bw, H/bh);
    return { src: useWide ? base.backgroundWide : base.background, w: bw*s, h: bh*s };
  }
  function fitRoom(){
    var stage = $('stage'), W = stage.clientWidth, H = stage.clientHeight;
    var room = stage.querySelector('.room'); if(!room || !base.backgroundSize) return null;
    var fit = roomFit(W, H);
    if(room.getAttribute('src') !== fit.src) room.setAttribute('src', fit.src);
    room.style.width = fit.w+'px'; room.style.height = fit.h+'px'; room.style.left = ((W-fit.w)/2)+'px'; room.style.top = ((H-fit.h)/2)+'px';
    var B = 120, rt = (H-fit.h)/2;
    Array.prototype.forEach.call(stage.querySelectorAll('.room-bleed'), function(bl){
      if(bl.getAttribute('src') !== fit.src) bl.setAttribute('src', fit.src);
      bl.style.width = fit.w+'px'; bl.style.height = B+'px'; bl.style.left = ((W-fit.w)/2)+'px';
      bl.style.top = (bl.classList.contains('top') ? rt - B : rt + fit.h) + 'px';
    });
    return fit;
  }
  if(base.background){
    $('stage').insertAdjacentHTML('beforeend',
      '<img class="bg" src="'+base.background+'" alt="" aria-hidden="true">' +
      '<img class="room" src="'+base.background+'" alt="" aria-hidden="true">' +
      '<img class="room-bleed top" src="'+base.background+'" alt="" aria-hidden="true"><img class="room-bleed bot" src="'+base.background+'" alt="" aria-hidden="true">' +
      '<div class="vignette"></div>');
    fitRoom();
    window.addEventListener('resize', fitRoom);
  }

  loadLive().then(function(live){
    // the built-in sample set only stands in for the Ink Theory page; other brands start empty
    var sample = (window.AXC_BRAND || 'inktheory') === 'inktheory' ? (base.garments || []) : [];
    var list = (live && live.length) ? live : sample;
    var garments = list.map(normalize).filter(Boolean);
    init(garments, !!(live && live.length));
  });

  // ---------------------------------------------------------------- viewer
  function init(garments, isLive){
    var data = base;
    var stage = $('stage'), side = $('side');
    var sheet = $('sheet'), scrim = $('scrim'), foot = $('foot');
    var closeup = $('closeup'), closeupImg = $('closeupImg'), closeupLbl = $('closeupLbl');
    var count = $('count'), dots = $('dots');
    $('collTitle').textContent = data.title || 'Your Collection';
    document.documentElement.dataset.source = isLive ? 'live' : 'sample';

    // fullscreen (where Safari/Chrome allow it)
    var fsBtn = $('fsBtn'), root = document.documentElement;
    var fsRequest = root.requestFullscreen || root.webkitRequestFullscreen;
    if((document.fullscreenEnabled || document.webkitFullscreenEnabled) && fsRequest){
      fsBtn.hidden = false;
      fsBtn.addEventListener('click', function(){ try{ var r = fsRequest.call(root, {navigationUI:'hide'}); if(r && r.catch) r.catch(function(){}); }catch(e){} });
      ['fullscreenchange','webkitfullscreenchange'].forEach(function(ev){
        document.addEventListener(ev, function(){ fsBtn.hidden = !!(document.fullscreenElement || document.webkitFullscreenElement); });
      });
    }

    if(!garments.length){
      stage.insertAdjacentHTML('beforeend', '<div class="empty">No garments yet.<br>Add them in Settings → Artist×Collab.</div>');
      foot.hidden = true; side.hidden = true; return;
    }

    // garments hang on a rail: cord from the ceiling, a swing pivot at the hook, front/back on a flip card
    var els = garments.map(function(g, i){
      var el = document.createElement('div'); el.className = 'g mount'; el.dataset.i = i;
      // solid black shoulder hanger like the original renders: flat cap the cord drops onto, arched arms, open underneath
      // the hanger is lifted from the original render (img/garments/hanger.png, 170x130 on the 806px reference canvas,
      // cap top 3px below its top edge, collar line 58px down); the viewer places it in those reference units
      var hanger = g.layout === 'garment' ? '<img class="hanger" src="'+(data.hangerImage || '/artistxcollab/img/garments/hanger.png')+'" alt="" draggable="false">' : '';
      // the hanger lives inside the flip so it turns with the garment; the cord stays put on the ceiling
      el.innerHTML = '<div class="cord"></div><div class="swing"><div class="flip">' + hanger +
        // each face sits in a padded box that owns the drop shadow, so the shadow is never clipped to the image's bounds on a 3D layer
        '<div class="face f"><img class="hero f" src="'+g.front.url+'" alt="'+(g.name||'')+'" draggable="false"></div>' +
        (g.back ? '<div class="face b"><img class="hero b" src="'+g.back.url+'" alt="'+(g.name||'')+' — back" draggable="false"></div>' : '') +
        (g.neck && g.layout === 'garment' ? '<div class="neck f" aria-hidden="true"><img src="'+(data.hangerImage || '/artistxcollab/img/garments/hanger.png')+'" alt="" draggable="false"><i></i></div>' : '') +
        (g.back && g.neckBack && g.layout === 'garment' ? '<div class="neck b" aria-hidden="true"><img src="'+(data.hangerImage || '/artistxcollab/img/garments/hanger.png')+'" alt="" draggable="false"><i></i></div>' : '') +
        '</div></div>' +
        (g.model ? '<div class="model" aria-hidden="true"><i class="mshadow wide"></i><i class="mshadow"></i><div class="mflip">' +
          '<div class="mcast"><img class="mimg cast" src="'+g.model.url+'" alt="" draggable="false"></div>' +   // the model's silhouette, blurred, thrown onto the wall by the spotlight (upper right)
          '<div class="mrefl"><img class="mimg refl" src="'+g.model.url+'" alt="" draggable="false"></div>' +   // faint mirror image in the glossy floor: this is what makes the feet read as touching
          '<div class="face f"><img class="mimg f" src="'+g.model.url+'" alt="" draggable="false"></div>' +
          (g.modelBack ? '<div class="face b"><img class="mimg b" src="'+g.modelBack.url+'" alt="" draggable="false"></div>' : '') +
          '</div></div>' : '');
      stage.appendChild(el);
      return el;
    });
    dots.innerHTML = garments.map(function(){ return '<i></i>'; }).join('');
    var dotEls = Array.prototype.slice.call(dots.children);

    var FACE_PAD = 96;   // room for the drop shadow (18px offset + ~3 sigma of a 22px blur) around every face
    function setFace(img, l, t, w, h){
      var box = img.parentNode;
      box.style.left = (l - FACE_PAD)+'px'; box.style.top = (t - FACE_PAD)+'px'; box.style.width = (w + 2*FACE_PAD)+'px'; box.style.height = (h + 2*FACE_PAD)+'px';
      img.style.left = FACE_PAD+'px'; img.style.top = FACE_PAD+'px'; img.style.width = w+'px'; img.style.height = h+'px';
    }
    function fitAll(){
      var W = stage.clientWidth, H = stage.clientHeight;
      var fit = fitRoom();
      garments.forEach(function(g, i){
        var iw = g.front.width, ih = g.front.height, left, top, rw, rh, hookTop;
        var roomH = fit ? fit.h : H, roomTop = fit ? (H - fit.h)/2 : 0;
        var hg = els[i].querySelector('.hanger');
        if(g.layout === 'garment'){
          // baseU = one reference px for the hanger (independent of the shirt-size tweak); each face is scaled/shifted on its own
          var baseW = (data.garmentWidth || 0.32) * roomH;
          hookTop = roomTop + (data.hookY || 0.34) * roomH;
          var hu = (baseW / 541) * g.hang.hangerScale;   // the hanger itself follows the front's setting
          var hgL = W/2 - 85*hu, hgT = hookTop - 3*hu;
          if(hg){ hg.style.left = hgL+'px'; hg.style.top = hgT+'px'; hg.style.width = (170*hu)+'px'; hg.style.height = (130*hu)+'px'; }
          // place one face: returns its box; mirrored=true for the back (it lives pre-rotated inside the flip)
          var placeFace = function(img, face, hang, neck, nk, mirrored){
            var fw = baseW * hang.scale, fh = face.height * (fw / face.width);
            var fl = (W - fw)/2, ft = hookTop + 55 * hu + hang.dy * fw;
            setFace(img, fl, ft, fw, fh);
            if(nk && neck){
              var nw = 2*neck.rx*fw, nh = 2*neck.ry*fh, nl = fl + (neck.cx - neck.rx) * fw, nt = ft + (neck.cy - neck.ry) * fh;
              if(mirrored) nl = W - (nl + nw);   // the flip mirrors the back about the centre line
              var clip = "path('"+neckPath(neck.shape, nw, nh)+"')";
              nk.style.left = nl+'px'; nk.style.top = nt+'px'; nk.style.width = nw+'px'; nk.style.height = nh+'px';
              nk.style.clipPath = clip; nk.style.webkitClipPath = clip; nk.style.background = rgba(neck.color, neck.strength);
              var ni = nk.firstChild, hl = mirrored ? W - (hgL + 170*hu) : hgL;
              ni.style.left = (hl - nl)+'px'; ni.style.top = (hgT - nt)+'px'; ni.style.width = (170*hu)+'px'; ni.style.height = (130*hu)+'px';
            }
            return { l: fl, t: ft, w: fw, h: fh };
          };
          var fb = placeFace(els[i].querySelector('img.hero.f'), g.front, g.hang, g.neck, els[i].querySelector('.neck.f'), false);
          var bimg = els[i].querySelector('img.hero.b');
          if(bimg) placeFace(bimg, g.back, g.hangBack, g.neckBack, els[i].querySelector('.neck.b'), true);
          left = fb.l; top = fb.t; rw = fb.w; rh = fb.h;
        } else {
          // legacy full-canvas plate with the hanger baked in
          var s = desktop() ? Math.min(W/iw, H/ih) : (fit ? fit.h/ih : Math.max(W/iw, H/ih));
          rw = iw*s; rh = ih*s;
          left = (W-rw)/2; top = (H-rh)/2 + (data.garmentShiftY || 0) * rh; hookTop = top + 0.34*rh;
        }
        if(g.layout !== 'garment') Array.prototype.forEach.call(els[i].querySelectorAll('.hero'), function(img){ setFace(img, left, top, rw, rh); });
        if(g.model){
          // the model stands on the floor: the SOLID soles (anchor measured at upload) land on the sole line; files without an anchor use their bottom edge
          var mh = (data.modelHeight || 0.56) * roomH * g.modelHang.scale, mw = g.model.width * (mh / g.model.height);
          var an = g.model.anchor || { cx: 0.5, bottom: 1, top: 0 };
          var sole = roomTop + (data.modelFeetY || 0.86) * roomH + g.modelHang.dy * mh;
          var mTop = sole - an.bottom * mh, mLeft = W/2 - an.cx * mw;
          setFace(els[i].querySelector('img.mimg.f'), mLeft, mTop, mw, mh);
          var mb = els[i].querySelector('img.mimg.b');
          if(mb){ var anb = g.modelBack.anchor || an, bw = g.modelBack.width * (mh / g.modelBack.height); setFace(mb, W/2 - anb.cx * bw, sole - anb.bottom * mh, bw, mh); }
          // grounding: one wide, feathered pool centred on the sole line (its top half hides behind the shoes and the reflection)
          var shA = els[i].querySelector('.mshadow:not(.wide)'), aw = mw * 1.2, ah = mw * 0.24;
          shA.style.left = (W/2 - aw/2)+'px'; shA.style.top = (sole - ah*0.42)+'px'; shA.style.width = aw+'px'; shA.style.height = ah+'px';
          var shB = els[i].querySelector('.mshadow.wide'), bw2 = mw * 1.9, bh2 = mw * 0.4;
          shB.style.left = (W/2 - bw2/2)+'px'; shB.style.top = (sole - bh2*0.45)+'px'; shB.style.width = bw2+'px'; shB.style.height = bh2+'px';
          // floor reflection: the figure mirrored so its soles meet the sole line, fading out over the first fifth
          var rimg = els[i].querySelector('img.mimg.refl'); setFace(rimg, mLeft, sole - (1 - an.bottom) * mh, mw, mh);
          var r0 = FACE_PAD + (1 - an.bottom) * mh;
          var rmask = 'linear-gradient(to top, rgba(0,0,0,0) '+r0+'px, rgba(0,0,0,.9) '+r0+'px, rgba(0,0,0,.25) '+(r0 + mh*0.07)+'px, rgba(0,0,0,0) '+(r0 + mh*0.22)+'px)';
          rimg.parentNode.style.webkitMaskImage = rmask; rimg.parentNode.style.maskImage = rmask;
          // cast shadow on the wall: the silhouette, offset down-left of the light and squashed a little
          setFace(els[i].querySelector('img.mimg.cast'), mLeft - mw*0.10, mTop + mh*0.03, mw*1.02, mh*0.97);
          els[i].querySelector('.mflip').style.transformOrigin = (W/2)+'px 50%';
        }
        var flip = els[i].querySelector('.flip'); flip.style.transformOrigin = (W/2)+'px 50%';
        els[i].querySelector('.swing').style.transformOrigin = (W/2)+'px '+hookTop+'px';
        var cord = els[i].querySelector('.cord'); cord.style.left = (W/2)+'px'; cord.style.height = (hookTop + 3)+'px';
      });
    }

    var cur = 0, W = stage.clientWidth;
    // Garment | Model view (the pill under the name; only offered when the garment has a model upload)
    var modelMode = false, modeEl = $('mode');
    function setMode(m){
      modelMode = !!m && !!garments[cur].model;
      $('app').classList.toggle('model-mode', modelMode);   // on the app wrapper so the footer (a sibling of the stage) follows too
      Array.prototype.forEach.call(modeEl.querySelectorAll('button'), function(b){ b.classList.toggle('on', (b.dataset.m === 'model') === modelMode); });
      sideFor = -1; buildSide(garments[cur]);
    }
    modeEl.addEventListener('click', function(e){ var b = e.target.closest('button'); if(b) setMode(b.dataset.m === 'model'); });
    function place(el, pos, dx){
      var t = pos + (dx ? dx/W : 0);
      el.style.transform = 'translateX('+(t * 100)+'%)';
      el.style.opacity = 1;
      el.style.zIndex = pos === 0 ? 3 : 2;
    }
    var swingEls = els.map(function(el){ return el.querySelector('.swing'); });
    function sway(deg, settle){
      swingEls.forEach(function(s){ s.classList.toggle('settle', !!settle); s.style.transform = 'rotate('+deg+'deg)'; });
    }
    function render(dx, animate, dur){
      W = stage.clientWidth;
      els.forEach(function(el, i){
        var pos = i - cur;
        el.classList.toggle('anim', !!animate);
        el.style.transitionDuration = animate && dur ? dur + 'ms' : '';
        if(pos > 1 || pos < -1){ el.style.opacity = 0; el.style.transform = 'translateX('+(pos>0?120:-120)+'%)'; el.style.zIndex = 1; return; }
        place(el, pos, dx||0);
      });
      els.forEach(function(el, i){ el.classList.toggle('active', i === cur); });
      var g = garments[cur];
      count.textContent = (cur+1) + ' / ' + garments.length;
      dotEls.forEach(function(d, i){ d.classList.toggle('on', i === cur); });
      $('stripName').textContent = g.name; $('stripArtist').textContent = g.artist;
      $('gName').textContent = g.name; $('gArtist').textContent = g.artist; $('gStory').textContent = g.story;
      $('specs').innerHTML = g.specs.map(function(s){ return '<dt>'+s[0]+'</dt><dd>'+s[1]+'</dd>'; }).join('');
      modeEl.hidden = !g.model;
      if(modelMode && !g.model) setMode(false);
      buildSide(g);
    }
    function go(n, dur){ cur = Math.max(0, Math.min(garments.length-1, n)); render(0, !reduced, dur); }

    // ---- side column: one button per closeup, plus the flip control when a back exists
    var sideFor = -1;
    function buildSide(g){
      if(sideFor === cur) return; sideFor = cur;
      var html = g.closeups.map(function(c, k){
        return '<button type="button" class="cu" data-k="'+k+'" aria-label="'+c.label+' closeup"><i></i><span>'+c.label+'</span></button>';
      }).join('');
      if(modelMode ? g.modelBack : g.back){
        html += '<button type="button" class="cu turn" id="turnBtn" aria-label="Turn around"><i><svg viewBox="0 0 24 24"><path d="M9 6l-4 4 4 4M15 6l4 4-4 4"/></svg></i><span>Turn</span></button>';
      }
      side.innerHTML = html;
      side.hidden = !html;
      els[cur].querySelector('.flip').classList.remove('back');
      var mf = els[cur].querySelector('.mflip'); if(mf) mf.classList.remove('back');
      var tb = $('turnBtn'); if(tb) tb.addEventListener('click', function(){
        var f = els[cur].querySelector(modelMode ? '.mflip' : '.flip'); f.classList.toggle('back'); tb.classList.toggle('on', f.classList.contains('back'));
        // when the turn settles, nudge the layer so the browser repaints the face cleanly (a stale raster can leave a hard shadow edge)
        var done = function(e){ if(e && e.target !== f) return; f.removeEventListener('transitionend', done); sway(0.02, false); requestAnimationFrame(function(){ sway(0, false); }); };
        f.addEventListener('transitionend', done); setTimeout(done, 1000);
      });
    }

    fitAll(); render(0, false);
    window.addEventListener('resize', function(){ fitAll(); render(0, false); });

    // ---- drag: horizontal = carousel (vertical swipes scroll the document, which opens the sheet)
    var drag = null, raf = 0;
    stage.addEventListener('pointerdown', function(e){
      if(sheetOpen){ closeSheet(); return; }
      drag = {x:e.clientX, y:e.clientY, lastX:e.clientX, lastT:performance.now(), v:0, axis:null, id:e.pointerId, dx:0};
      capture(stage, e.pointerId);
    });
    stage.addEventListener('pointermove', function(e){
      if(!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y, now = performance.now();
      if(!drag.axis){ if(Math.abs(dx) > 6 || Math.abs(dy) > 6) drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; else return; }
      if(drag.axis !== 'x') return;
      var dt = now - drag.lastT;
      if(dt >= 8){ var inst = (e.clientX - drag.lastX) / dt; drag.v = drag.v * 0.6 + inst * 0.4; drag.lastX = e.clientX; drag.lastT = now; }
      var atEdge = (cur === 0 && dx > 0) || (cur === garments.length-1 && dx < 0);
      drag.dx = atEdge ? dx * 0.35 : dx;
      if(!raf) raf = requestAnimationFrame(function(){ raf = 0; if(drag){ render(drag.dx, false); sway(Math.max(-6, Math.min(6, -drag.v * 5)), false); } });
    });
    function endDrag(e){
      if(!drag || e.pointerId !== drag.id) return;
      var d = drag; drag = null;
      if(raf){ cancelAnimationFrame(raf); raf = 0; }
      var dx = e.clientX - d.x, dy = e.clientY - d.y;
      if(d.axis === 'x'){
        var v = (performance.now() - d.lastT) > 80 ? 0 : d.v;
        var flick = Math.abs(v) > 0.35;
        var dir = flick ? (v < 0 ? 1 : -1) : (dx < 0 ? 1 : -1);
        var advance = flick || Math.abs(dx) > W * 0.22;
        var remaining = advance ? W - Math.abs(d.dx) : Math.abs(d.dx);
        var dur = Math.max(220, Math.min(480, remaining / Math.max(Math.abs(v), 0.9)));
        if(advance) go(cur + dir, dur); else render(0, !reduced, dur);
        sway(reduced ? 0 : Math.max(-4, Math.min(4, -v * 4)), false);
        requestAnimationFrame(function(){ sway(0, !reduced); });
      } else if(d.axis === 'y'){
        if(dy < -60 && !sheetOpen) openSheet();
      }
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    $('prevBtn').addEventListener('click', function(){ go(cur-1); });
    $('nextBtn').addEventListener('click', function(){ go(cur+1); });
    window.addEventListener('keydown', function(e){
      if(e.key === 'ArrowRight') go(cur+1); else if(e.key === 'ArrowLeft') go(cur-1);
      else if(e.key === 'ArrowUp') openSheet(); else if(e.key === 'ArrowDown' || e.key === 'Escape'){ closeSheet(); hideCloseup(true); }
    });

    // ---- details sheet (opens off a short upward scroll, which also lets Safari collapse its bars)
    // start from the top, and don't let a restored scroll position or layout settling open the sheet on load
    if('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    var sheetOpen = false, baseY = window.scrollY, armedAt = performance.now() + 700;
    function openSheet(){ sheetOpen = true; sheet.classList.add('on'); scrim.classList.add('on'); foot.classList.add('hide'); side.classList.add('hide'); }
    function closeSheet(){
      sheetOpen = false; sheet.classList.remove('on'); scrim.classList.remove('on'); foot.classList.remove('hide'); side.classList.remove('hide'); sheet.style.transform = '';
      var max = document.documentElement.scrollHeight - window.innerHeight;
      if(window.scrollY > max - 160){ window.scrollTo(0, Math.max(0, max - 320)); }
      baseY = window.scrollY;
    }
    window.addEventListener('scroll', function(){
      if(sheetOpen) return;
      if(performance.now() < armedAt){ baseY = window.scrollY; return; }
      if(window.scrollY - baseY > 40) openSheet();
      else if(window.scrollY < baseY) baseY = window.scrollY;
    }, {passive:true});
    $('hint').addEventListener('click', openSheet);
    scrim.addEventListener('click', closeSheet);
    var sd = null;
    sheet.addEventListener('pointerdown', function(e){
      var sc = sheet.querySelector('.sheet-scroll');
      if(sc.scrollTop > 0 && !e.target.closest('.grab')) return;
      sd = {y:e.clientY, id:e.pointerId}; capture(sheet, e.pointerId); sheet.classList.add('drag');
    });
    sheet.addEventListener('pointermove', function(e){
      if(!sd || e.pointerId !== sd.id) return;
      var dy = Math.max(0, e.clientY - sd.y);
      sheet.style.transform = desktop() ? 'translate(-50%,'+dy+'px)' : 'translateY('+dy+'px)';
    });
    function endSheetDrag(e){
      if(!sd || e.pointerId !== sd.id) return;
      var dy = e.clientY - sd.y; sd = null; sheet.classList.remove('drag');
      if(dy > 90) closeSheet(); else sheet.style.transform = '';
    }
    sheet.addEventListener('pointerup', endSheetDrag);
    sheet.addEventListener('pointercancel', endSheetDrag);

    // ---- closeups: press & hold a side button to look, quick tap keeps it open with a close button
    var hold = null;
    function showCloseup(c, originX, originY, sticky){
      closeupImg.src = c.image; closeupImg.alt = c.label;
      closeupLbl.textContent = c.label;
      closeup.style.transformOrigin = originX+'px '+originY+'px';
      closeup.classList.toggle('sticky', !!sticky);
      closeup.classList.add('on'); closeup.setAttribute('aria-hidden','false');
    }
    function hideCloseup(force){
      if(!force && closeup.classList.contains('sticky')) return;
      closeup.classList.remove('on','sticky'); closeup.setAttribute('aria-hidden','true');
    }
    side.addEventListener('pointerdown', function(e){
      var btn = e.target.closest('.cu'); if(!btn || btn.classList.contains('turn')) return;
      e.preventDefault();
      var c = garments[cur].closeups[btn.dataset.k]; if(!c) return;
      capture(btn, e.pointerId); btn.classList.add('held');
      hold = {btn:btn, c:c, x:e.clientX, y:e.clientY, id:e.pointerId, opened:false, t:performance.now()};
      hold.timer = setTimeout(function(){ if(hold){ hold.opened = true; showCloseup(c, hold.x, hold.y, false); } }, 160);
    });
    function endHold(e){
      if(!hold || e.pointerId !== hold.id) return;
      clearTimeout(hold.timer); hold.btn.classList.remove('held');
      var quick = !hold.opened && (performance.now() - hold.t) < 160;
      if(quick){ showCloseup(hold.c, hold.x, hold.y, true); } else { hideCloseup(false); }
      hold = null;
    }
    window.addEventListener('pointerup', endHold, true);
    window.addEventListener('pointercancel', endHold, true);
    $('closeupX').addEventListener('click', function(){ hideCloseup(true); });
    closeup.addEventListener('click', function(e){ if(closeup.classList.contains('sticky') && !e.target.closest('.x')) hideCloseup(true); });
    closeup.addEventListener('contextmenu', function(e){ e.preventDefault(); });
    side.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  }
})();
