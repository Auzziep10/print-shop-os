(function(){
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var data = window.AXC_COLLECTION || {garments:[]};
  var garments = (data.garments || []).filter(function(g){ return g && g.image; });
  var stage = document.getElementById('stage');
  var sheet = document.getElementById('sheet'), scrim = document.getElementById('scrim'), foot = document.getElementById('foot');
  var closeup = document.getElementById('closeup'), closeupImg = document.getElementById('closeupImg'), closeupLbl = document.getElementById('closeupLbl');
  var count = document.getElementById('count'), dots = document.getElementById('dots');
  document.getElementById('collTitle').textContent = data.title || 'Your Collection';

  if(!garments.length){
    stage.innerHTML = '<div class="empty">No garments yet.<br>Add them in Settings → Artist×Collab.</div>';
    foot.hidden = true; return;
  }

  var desktop = function(){ return window.matchMedia('(min-width:900px)').matches; };
  function capture(el, id){ try{ el.setPointerCapture(id); }catch(e){} }
  var els = garments.map(function(g, i){
    var el = document.createElement('div'); el.className = 'g'; el.dataset.i = i;
    el.innerHTML = '<img class="bg" src="'+g.image+'" alt="" aria-hidden="true">' +
      '<img class="hero" src="'+g.image+'" alt="'+(g.name||'')+'" draggable="false">' +
      '<div class="vignette"></div><div class="pins"></div>';
    var pins = el.querySelector('.pins');
    (g.hotspots || []).forEach(function(h, k){
      var p = document.createElement('button'); p.className = 'pin'; p.type = 'button';
      p.setAttribute('aria-label', h.label || 'Closeup'); p.dataset.k = k; p.style.left = (h.x*100)+'%'; p.style.top = (h.y*100)+'%';
      pins.appendChild(p);
    });
    stage.appendChild(el);
    return el;
  });
  dots.innerHTML = garments.map(function(){ return '<i></i>'; }).join('');
  var dotEls = Array.prototype.slice.call(dots.children);

  // rendered box of the hero image (cover on phones, contain on desktop) so pins track the garment
  function fitPins(){
    var W = stage.clientWidth, H = stage.clientHeight;
    garments.forEach(function(g, i){
      var iw = (g.imageSize && g.imageSize[0]) || 920, ih = (g.imageSize && g.imageSize[1]) || 2000;
      var s = desktop() ? Math.min(W/iw, H/ih) : Math.max(W/iw, H/ih);
      var rw = iw*s, rh = ih*s, pins = els[i].querySelector('.pins');
      pins.style.left = ((W-rw)/2)+'px'; pins.style.top = ((H-rh)/2)+'px'; pins.style.width = rw+'px'; pins.style.height = rh+'px';
    });
  }

  var cur = 0, W = stage.clientWidth;
  function place(el, pos, dx){
    var t = pos + (dx ? -dx/W : 0);
    var abs = Math.min(Math.abs(t), 1.5);
    var x = t * 62, ry = -t * 34, sc = 1 - abs*0.16, op = Math.max(0, 1 - abs*0.9);
    el.style.transform = 'translateX('+x+'%) rotateY('+ry+'deg) scale('+sc+')';
    el.style.opacity = op;
    el.style.zIndex = pos === 0 ? 3 : 2;
  }
  function render(dx, animate){
    W = stage.clientWidth;
    els.forEach(function(el, i){
      var pos = i - cur;
      el.classList.toggle('anim', !!animate);
      if(pos > 1 || pos < -1){ el.style.opacity = 0; el.style.transform = 'translateX('+(pos>0?120:-120)+'%) scale(.7)'; el.style.zIndex = 1; return; }
      place(el, pos, dx||0);
    });
    els.forEach(function(el, i){ el.classList.toggle('active', i === cur); });
    var g = garments[cur];
    count.textContent = (cur+1) + ' / ' + garments.length;
    dotEls.forEach(function(d, i){ d.classList.toggle('on', i === cur); });
    document.getElementById('stripName').textContent = g.name || '';
    document.getElementById('stripArtist').textContent = g.artist || '';
    document.getElementById('gName').textContent = g.name || '';
    document.getElementById('gArtist').textContent = g.artist || '';
    document.getElementById('gStory').textContent = g.story || '';
    document.getElementById('specs').innerHTML = (g.specs || []).map(function(s){ return '<dt>'+s[0]+'</dt><dd>'+s[1]+'</dd>'; }).join('');
  }
  function go(n){ cur = Math.max(0, Math.min(garments.length-1, n)); render(0, !reduced); }

  fitPins(); render(0, false);
  window.addEventListener('resize', function(){ fitPins(); render(0, false); });

  // ---- drag: horizontal = carousel, vertical up = details
  var drag = null;
  stage.addEventListener('pointerdown', function(e){
    if(e.target.closest('.pin')) return;
    if(sheetOpen){ closeSheet(); return; }
    drag = {x:e.clientX, y:e.clientY, t:performance.now(), axis:null, id:e.pointerId};
    capture(stage, e.pointerId);
  });
  stage.addEventListener('pointermove', function(e){
    if(!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if(!drag.axis){ if(Math.abs(dx) > 8 || Math.abs(dy) > 8) drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'; else return; }
    if(drag.axis === 'x'){
      var bounded = (cur === 0 && dx > 0) || (cur === garments.length-1 && dx < 0) ? dx*0.3 : dx;
      render(bounded, false); drag.dx = bounded;
    }
  });
  function endDrag(e){
    if(!drag || e.pointerId !== drag.id) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y, dt = performance.now() - drag.t;
    var axis = drag.axis; drag = null;
    if(axis === 'x'){
      var v = Math.abs(dx)/Math.max(dt,1);
      if(Math.abs(dx) > W*0.18 || v > 0.55){ go(cur + (dx < 0 ? 1 : -1)); } else { render(0, !reduced); }
    } else if(axis === 'y'){
      if(dy < -60) openSheet();
    }
  }
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  document.getElementById('prevBtn').addEventListener('click', function(){ go(cur-1); });
  document.getElementById('nextBtn').addEventListener('click', function(){ go(cur+1); });
  window.addEventListener('keydown', function(e){
    if(e.key === 'ArrowRight') go(cur+1); else if(e.key === 'ArrowLeft') go(cur-1);
    else if(e.key === 'ArrowUp') openSheet(); else if(e.key === 'ArrowDown' || e.key === 'Escape'){ closeSheet(); hideCloseup(true); }
  });

  // ---- details sheet
  var sheetOpen = false;
  function openSheet(){ sheetOpen = true; sheet.classList.add('on'); scrim.classList.add('on'); foot.classList.add('hide'); }
  function closeSheet(){ sheetOpen = false; sheet.classList.remove('on'); scrim.classList.remove('on'); foot.classList.remove('hide'); sheet.style.transform = ''; }
  document.getElementById('hint').addEventListener('click', openSheet);
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

  // ---- pins: press & hold shows the closeup; a quick tap pins it open with a close button
  var hold = null;
  function showCloseup(h, originX, originY, sticky){
    closeupImg.src = h.image; closeupImg.alt = h.label || '';
    closeupLbl.textContent = h.label || '';
    closeup.style.transformOrigin = originX+'px '+originY+'px';
    closeup.classList.toggle('sticky', !!sticky);
    closeup.classList.add('on'); closeup.setAttribute('aria-hidden','false');
  }
  function hideCloseup(force){
    if(!force && closeup.classList.contains('sticky')) return;
    closeup.classList.remove('on','sticky'); closeup.setAttribute('aria-hidden','true');
  }
  stage.addEventListener('pointerdown', function(e){
    var pin = e.target.closest('.pin'); if(!pin) return;
    e.stopPropagation(); e.preventDefault();
    var g = garments[cur], h = g.hotspots[pin.dataset.k]; if(!h) return;
    capture(pin, e.pointerId); pin.classList.add('held');
    hold = {pin:pin, h:h, x:e.clientX, y:e.clientY, id:e.pointerId, opened:false, t:performance.now()};
    hold.timer = setTimeout(function(){ if(hold){ hold.opened = true; showCloseup(h, hold.x, hold.y, false); } }, 160);
  }, true);
  function endHold(e){
    if(!hold || e.pointerId !== hold.id) return;
    clearTimeout(hold.timer); hold.pin.classList.remove('held');
    var quick = !hold.opened && (performance.now() - hold.t) < 160;
    if(quick){ showCloseup(hold.h, hold.x, hold.y, true); }
    else { hideCloseup(false); }
    hold = null;
  }
  window.addEventListener('pointerup', endHold, true);
  window.addEventListener('pointercancel', endHold, true);
  document.getElementById('closeupX').addEventListener('click', function(){ hideCloseup(true); });
  closeup.addEventListener('click', function(e){ if(closeup.classList.contains('sticky') && !e.target.closest('.x')) hideCloseup(true); });
  closeup.addEventListener('contextmenu', function(e){ e.preventDefault(); });
  stage.addEventListener('contextmenu', function(e){ if(e.target.closest('.pin')) e.preventDefault(); });
})();
