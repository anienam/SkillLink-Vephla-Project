// Worker Profile updater (novice-friendly)
(function(){
  // Ensure API_BASE is available
  var API_BASE = (function(){
    if (typeof window.API_BASE === 'string') return window.API_BASE;
    var meta = document.querySelector('meta[name="sl-api-base"]');
    if (meta && meta.content) return meta.content;
    return 'https://skill-link-gg2c.onrender.com/api';
  })();

  function $(sel, root){ return (root||document).querySelector(sel); }
  function msg(text, type){
    var el = document.getElementById('profile-msg');
    if(!el) return;
    el.textContent = text || '';
    el.className = 'msg ' + (type||'info');
    el.hidden = !text;
  }
  // Cloudinary-aware URL resolver
  function absUrl(u, cloudinaryId){
    if (window.SLMedia && typeof SLMedia.resolveUrl === 'function') return SLMedia.resolveUrl(u, cloudinaryId);
    // Fallback (legacy)
    if (!u) return u;
    if (/^https?:\/\//i.test(u)) return u; // already absolute
    var host = API_BASE.replace(/\/$/,'').replace(/\/api$/,'');
    if (u.charAt(0) !== '/') u = '/' + u; return host + u;
  }

  // Preload helper to avoid setting broken backgrounds
  function setBgIfLoaded(el, url){
    if (!el || !url) return;
    var img = new Image();
    img.onload = function(){
      el.style.backgroundImage = "url('"+url+"')";
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
    };
    img.onerror = function(){ /* keep existing placeholder */ };
    img.src = url;
  }
  // skills state kept in-memory
  var primarySkillsState = [];
  var portfolioState = [];
  var certsState = [];
  function joinSkills(arr){
    if (!arr) return '';
    try { return arr.join(', '); } catch(_) { return ''; }
  }
  function splitSkills(text){
    if (!text) return [];
    return text.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  }

  function setImageBg(url){
    var cont = document.querySelector('.profile-image-cont');
    if (!cont) return;
  if (!url) return; // keep existing placeholder background
  url = absUrl(url);
  setBgIfLoaded(cont, url);
  }

  function renderSkills(skills){
    var wrap = document.querySelector('.profile-skill');
    if (!wrap) return;
    // Clear and rebuild chips
    wrap.innerHTML = '';
    var list = Array.isArray(skills) ? skills : [];
    list.forEach(function(s, idx){
      var chip = document.createElement('div');
      chip.className = 'profile-skill-item';
      chip.textContent = s;
      chip.title = 'Click to remove';
      chip.style.cursor = 'pointer';
      chip.addEventListener('click', function(){
        primarySkillsState.splice(idx, 1);
        renderSkills(primarySkillsState);
        // Auto-save after removing skill
        msg('Saving skills…','info');
        var payload = {
          skilledWorker: {
            primarySkills: primarySkillsState && primarySkillsState.length ? primarySkillsState : undefined
          }
        };
        patchProfile(payload, function(err, data){
          if (err){ msg(err.message||'Failed to save skills','error'); return; }
          msg('Skills saved','success');
        });
      });
      wrap.appendChild(chip);
    });
    var add = document.createElement('div');
    add.className = 'profile-skill-item profile-skill-item5';
    add.innerHTML = '<i class="fa-solid fa-plus"></i> Add Skill';
    add.addEventListener('click', function(){
      askModal({ title: 'Add skills', label: 'Enter skills (comma-separated)', placeholder: 'plumbing, repair', okText: 'Add' }, function(value){
        if (!value) return;
        var extras = value.split(',').map(function(t){ return (t||'').trim(); }).filter(Boolean);
        if (!extras.length) return;
        primarySkillsState = Array.from(new Set(primarySkillsState.concat(extras)));
        renderSkills(primarySkillsState);
        // Auto-save the updated skills
        msg('Saving skills…','info');
        var payload = {
          skilledWorker: {
            primarySkills: primarySkillsState && primarySkillsState.length ? primarySkillsState : undefined
          }
        };
        patchProfile(payload, function(err, data){
          if (err){ msg(err.message||'Failed to save skills','error'); return; }
          msg('Skills saved','success');
        });
      });
    });
    wrap.appendChild(add);
  }

  function loadMe(){
    if (typeof getMe !== 'function') return;
    getMe(function(err, me){
      if (err || !me) return;
      try {
        $('#profile-name').value = me.name || (me.firstname? (me.firstname + ' ' + (me.lastname||'')) : '');
        $('#profile-email').value = me.email || '';
        var sw = me.skilledWorker || {};
        $('#profile-title').value = sw.professionalTitle || '';
        $('#location').value = sw.location || '';
        $('#profile-bio').value = sw.shortBio || '';
        var hourly = (typeof sw.hourlyRate === 'number') ? sw.hourlyRate : '';
        $('#profile-hourly').value = hourly;
  // availability toggle (checked => available)
  var tog = document.getElementById('toggle');
  if (tog) tog.checked = !!sw.availability;
  // skills
  primarySkillsState = Array.isArray(sw.primarySkills) ? sw.primarySkills.slice(0) : [];
  renderSkills(primarySkillsState);
  // portfolio
  portfolioState = Array.isArray(sw.portfolioSamples) ? sw.portfolioSamples.slice(0) : [];
  renderPortfolio(portfolioState);
  // certs
  certsState = Array.isArray(sw.certifications) ? sw.certifications.slice(0) : [];
  renderCerts(certsState);
        setImageBg(sw.profileImage || '');
      } catch(_){}
    });
  }

  function patchProfile(payload, done){
    if (typeof callApi === 'function'){
      return callApi('/auth/profile','PATCH',payload,true,done);
    }
    // Fallback
    var headers = { 'Content-Type':'application/json','Accept':'application/json' };
    try { var t = getToken(); if(t) headers['Authorization']='Bearer '+t; } catch(_){}
    fetch((API_BASE||'') + '/auth/profile', { method:'PATCH', headers: headers, body: JSON.stringify(payload) })
      .then(function(r){ return r.json().catch(function(){return {};}).then(function(j){ return { ok:r.ok, data:j, statusText:r.statusText }; }); })
      .then(function(out){ if(!out.ok){ return done(new Error((out.data&&out.data.message)||out.statusText||'Failed')); } done(null,out.data); })
      .catch(function(e){ done(e); });
  }

  function bindUpload(){
    var file = document.getElementById('upload');
    if (!file) return;
    file.addEventListener('change', function(){
      var f = file.files && file.files[0];
      if(!f){ msg('No file selected','error'); return; }
      msg('Uploading photo…','info');
      var t = (typeof getToken==='function')? getToken() : (sessionStorage.getItem('sl_token')||localStorage.getItem('sl_token'));
      if(!t){ msg('Please login again','error'); return; }
      var fd = new FormData();
      fd.append('image', f);
      // Backend now uploads to Cloudinary and returns { file: { url, cloudinaryId, ... } }
      fetch(API_BASE + '/uploads/image', { method:'POST', headers: { 'Authorization':'Bearer '+t }, body: fd })
        .then(function(r){ return r.json().catch(function(){return {};}).then(function(j){ return { ok:r.ok, data:j, statusText:r.statusText }; }); })
        .then(function(out){ if(!out.ok) throw new Error((out.data&&out.data.message)||out.statusText||'Upload failed');
          var file = out.data && (out.data.file||out.data);
          var u = file && (file.url || file.absoluteUrl);
          if (!u){ msg('Upload completed but no URL returned','error'); return; }
          var abs = absUrl(file.url || file.absoluteUrl, file.cloudinaryId);
          // Save into profile with absolute URL
          var update = { skilledWorker: { profileImage: abs } };
          if (file.cloudinaryId) { update.skilledWorker.cloudinaryId = file.cloudinaryId; }
          patchProfile(update, function(err){
            if (err){ msg(err.message||'Failed to update profile image','error'); return; }
            msg('Profile photo updated','success');
            setImageBg(abs);
          });
        })
        .catch(function(e){ msg(e.message||'Upload failed','error'); });
    });
  }

  function renderPortfolio(list){
    var grid = document.querySelector('.prof-port');
    if (!grid) return;
    // Keep 6 slots; fill with backgrounds
    var slots = grid.querySelectorAll('.prof-port-item');
    for (var i=0; i<slots.length; i++){
      var item = slots[i];
      var p = list[i];
      if (p && p.url){
        var url = absUrl(p.url, p.cloudinaryId);
        setBgIfLoaded(item, url);
        item.title = p.caption || '';
      } else {
        // Do not clear; preserve CSS placeholder background
      }
    }
  }

  function renderCerts(list){
    var wrap = document.getElementById('cert-list');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!list || !list.length){
      var empty = document.createElement('div');
      empty.textContent = 'No certifications yet';
      empty.style.fontSize = '14px';
      empty.style.color = '#444';
      wrap.appendChild(empty);
      return;
    }
    list.forEach(function(c, idx){
      var card = document.createElement('div');
      card.className = 'cert-card';

  var icon = document.createElement('div');
  icon.className = 'cert-icon';

      var title = document.createElement('div');
      title.className = 'cert-title';
      title.textContent = c.label || ('Certificate ' + (idx+1));

      var href = c.fileUrl || c.url; href = absUrl(href);
      // Show file extension in the icon box for quick visual cue
      try {
        var ext = (href && href.split('?')[0].split('#')[0].split('.').pop()) || '';
        ext = (ext || '').toUpperCase();
        if (!ext || ext.length > 4) ext = 'FILE';
        icon.textContent = ext;
      } catch(_){ icon.textContent = 'FILE'; }
      var link = document.createElement('a');
      link.className = 'link-btn';
      link.textContent = 'View';
      link.target = '_blank';
      link.rel = 'noopener';
      link.href = href || '#';
      link.title = 'Open certification';

      var del = document.createElement('button');
      del.className = 'danger-btn';
      del.textContent = 'Remove';
      del.type = 'button';
      del.addEventListener('click', function(){
        certsState.splice(idx, 1);
        patchProfile({ skilledWorker: { certifications: certsState } }, function(err){
          if (err) { msg(err.message||'Failed to remove certification','error'); return; }
          msg('Certification removed','success');
          renderCerts(certsState);
        });
      });

      // Match 4-column grid: icon | title | link | remove
      card.appendChild(icon);
      card.appendChild(title);
      card.appendChild(link);
      card.appendChild(del);

      wrap.appendChild(card);
    });
  }

  // Simple modal helper (replaces prompt)
  function askModal(opts, done){
    var backdrop = document.getElementById('modal-backdrop');
    var modal = document.getElementById('modal');
    var title = document.getElementById('modal-title');
    var label = document.getElementById('modal-label');
    var input = document.getElementById('modal-input');
    var ok = document.getElementById('modal-ok');
    var cancel = document.getElementById('modal-cancel');
    var close = document.getElementById('modal-close');
    
    if (!backdrop || !modal || !title || !label || !input || !ok || !cancel || !close){ 
      console.error('Modal elements not found:', {backdrop,modal,title,label,input,ok,cancel,close});
      return done && done(null); 
    }
    
    title.textContent = (opts && opts.title) || 'Input';
    label.textContent = (opts && opts.label) || 'Value';
    input.type = (opts && opts.type) || 'text';
    input.value = (opts && opts.value) || '';
    input.placeholder = (opts && opts.placeholder) || '';
    ok.textContent = (opts && opts.okText) || 'OK';

    function hide(){ 
      backdrop.style.display='none'; 
      modal.style.display='none'; 
      ok.onclick=null; 
      cancel.onclick=null; 
      close.onclick=null; 
      document.onkeydown=null; 
    }
    function submit(){ 
      var v = input.value.trim(); 
      hide(); 
      if(done) done(v); 
    }
    backdrop.style.display='block';
    modal.style.display='block';
    setTimeout(function(){ 
      input.focus(); 
      if(input.select) input.select(); 
    }, 100);
    ok.onclick = submit;
    cancel.onclick = function(){ hide(); if(done) done(null); };
    close.onclick = function(){ hide(); if(done) done(null); };
    document.onkeydown = function(e){ 
      if(e.key==='Escape'){ hide(); if(done) done(null);} 
      if(e.key==='Enter'){ submit(); } 
    };
  }

  function bindPortfolioAdd(){
    var btn = document.getElementById('portfolio-add-btn');
    if (!btn) return;
    // Open dedicated modal
    btn.addEventListener('click', function(){
      openModal('portfolio-modal');
    });
  }

  function bindCertAdd(){
    var btn = document.getElementById('cert-add-btn');
    if (!btn) {
      console.error('cert-add-btn element not found');
      return;
    }
    btn.addEventListener('click', function(){ openModal('cert-modal'); });
  }

  // NIN quick-add: upload a document and save as a certification with label "NIN"
  function bindNinAdd(){
    var btn = document.getElementById('nin-add-btn');
    if (!btn) return;
    btn.addEventListener('click', function(){ openModal('cert-modal'); var lbl=document.getElementById('cert-label'); if(lbl) lbl.value='NIN'; });
  }

  // Modal utilities and save handlers 
  function showBackdrop(show){
    var bd = document.getElementById('modal-backdrop');
    if (!bd) return; bd.style.display = show ? 'block' : 'none';
  }
  function anyModalOpen(){
    return !!document.querySelector('#skill-modal[style*="display: block"],#cert-modal[style*="display: block"],#portfolio-modal[style*="display: block"],#modal[style*="display: block"]');
  }
  function openModal(id){
    var el = document.getElementById(id);
    if (!el) return;
    showBackdrop(true);
    el.style.display = 'block';
  }
  function closeModal(id){
    var el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'none';
    if (!anyModalOpen()) showBackdrop(false);
  }
  document.addEventListener('click', function(e){
    var t = e.target;
    var closeFor = t && t.getAttribute && (t.getAttribute('data-close')||t.getAttribute('data-cancel'));
    if (closeFor){ closeModal(closeFor); }
  });

  function setBusy(btn, busy){ if(!btn) return; btn.disabled = !!busy; var txt = btn.getAttribute('data-txt')||btn.textContent; if (!btn.getAttribute('data-txt')) btn.setAttribute('data-txt', txt); btn.textContent = busy ? 'Saving...' : btn.getAttribute('data-txt'); }

  // Save Skills
  document.addEventListener('click', function(e){
    if (!(e.target && e.target.id === 'skill-save')) return;
    var ta = document.getElementById('skill-input');
    var val = (ta && ta.value) ? ta.value.trim() : '';
    if (!val){ msg('Enter at least one skill','error'); return; }
    var extras = val.split(',').map(function(s){ return s.trim(); }).filter(Boolean);
    if (!extras.length){ msg('Enter at least one skill','error'); return; }
    // merge + dedupe
    primarySkillsState = Array.from(new Set((primarySkillsState||[]).concat(extras)));
    renderSkills(primarySkillsState);
    msg('Saving skills…','info');
    var payload = { skilledWorker: { primarySkills: primarySkillsState } };
    patchProfile(payload, function(err){
      if (err){ msg(err.message||'Failed to save skills','error'); return; }
      msg('Skills saved','success');
      ta.value = '';
      closeModal('skill-modal');
    });
  });

  // Save Certification
  document.addEventListener('click', function(e){
    if (!(e.target && e.target.id === 'cert-save')) return;
    var btn = e.target;
    var label = (document.getElementById('cert-label')||{}).value || '';
    var fileIn = document.getElementById('cert-file');
    var f = fileIn && fileIn.files && fileIn.files[0];
    if (!label.trim()){ msg('Enter a certification label','error'); return; }
    if (!f){ msg('Choose a certification file','error'); return; }
    msg('Uploading certification…','info');
    setBusy(btn, true);
    var t = (typeof getToken==='function')? getToken() : (sessionStorage.getItem('sl_token')||localStorage.getItem('sl_token'));
    if(!t){ setBusy(btn,false); msg('Please login again','error'); return; }
    var fd = new FormData(); fd.append('file', f);
    fetch(API_BASE + '/uploads/file', { method:'POST', headers:{ 'Authorization':'Bearer '+t }, body: fd })
      .then(function(r){ return r.json().catch(function(){return {};}).then(function(j){ return { ok:r.ok, data:j, statusText:r.statusText }; }); })
      .then(function(out){ if(!out.ok) throw new Error((out.data&&out.data.message)||out.statusText||'Upload failed');
        var file = out.data && (out.data.file||out.data);
        var relOrAbs = file && (file.url || file.absoluteUrl);
        if (!relOrAbs) throw new Error('Upload completed but no URL');
        var abs = (typeof SLMedia!=='undefined' && SLMedia.resolveUrl)? SLMedia.resolveUrl(relOrAbs, file.cloudinaryId) : relOrAbs;
        var savedUrl = (file && file.url) ? file.url : abs;
        var next = (certsState||[]).concat([{ label: label.trim(), fileUrl: savedUrl, cloudinaryId: file.cloudinaryId }]);
        patchProfile({ skilledWorker: { certifications: next } }, function(err){
          setBusy(btn,false);
          if (err){ msg(err.message||'Failed to add certification','error'); return; }
          certsState = next; renderCerts(certsState); msg('Certification added','success');
          // reset inputs and close
          try { document.getElementById('cert-label').value=''; if (fileIn) fileIn.value=''; } catch(_){ }
          closeModal('cert-modal');
        });
      })
      .catch(function(e){ setBusy(btn,false); msg(e.message||'Upload failed','error'); });
  });

  // Save Portfolio
  document.addEventListener('click', function(e){
    if (!(e.target && e.target.id === 'portfolio-save')) return;
    var btn = e.target;
    var type = (document.getElementById('portfolio-type')||{}).value || 'image';
    var caption = (document.getElementById('portfolio-caption')||{}).value || '';
    var fileIn = document.getElementById('portfolio-file');
    var f = fileIn && fileIn.files && fileIn.files[0];
    if (!f){ msg('Choose a portfolio file','error'); return; }
    setBusy(btn,true);
    msg('Uploading portfolio…','info');
    var t = (typeof getToken==='function')? getToken() : (sessionStorage.getItem('sl_token')||localStorage.getItem('sl_token'));
    if(!t){ setBusy(btn,false); msg('Please login again','error'); return; }
    var fd = new FormData();
    var uploadPath = (type === 'image') ? '/uploads/image' : '/uploads/file';
    var fieldName = (type === 'image') ? 'image' : 'file';
    fd.append(fieldName, f);
    fetch(API_BASE + uploadPath, { method:'POST', headers:{ 'Authorization':'Bearer '+t }, body: fd })
      .then(function(r){ return r.json().catch(function(){return {};}).then(function(j){ return { ok:r.ok, data:j, statusText:r.statusText }; }); })
      .then(function(out){ if(!out.ok) throw new Error((out.data&&out.data.message)||out.statusText||'Upload failed');
        var file = out.data && (out.data.file||out.data);
        var relOrAbs = file && (file.url || file.absoluteUrl);
        if (!relOrAbs) throw new Error('Upload completed but no URL');
        var abs = (typeof SLMedia!=='undefined' && SLMedia.resolveUrl)? SLMedia.resolveUrl(relOrAbs, file.cloudinaryId) : relOrAbs;
        var savedUrl = (file && file.url) ? file.url : abs;
        var sample = { url: savedUrl, caption: caption || '', mediaType: (type==='image'?'image':'file') };
        if (file.cloudinaryId) sample.cloudinaryId = file.cloudinaryId;
        var next = (portfolioState||[]).concat([ sample ]);
        patchProfile({ skilledWorker: { portfolioSamples: next } }, function(err){
          setBusy(btn,false);
          if (err){ msg(err.message||'Failed to add portfolio','error'); return; }
          portfolioState = next; renderPortfolio(portfolioState); msg('Portfolio updated','success');
          // reset inputs and close
          try { if (fileIn) fileIn.value=''; var cap = document.getElementById('portfolio-caption'); if (cap) cap.value=''; } catch(_){ }
          closeModal('portfolio-modal');
        });
      })
      .catch(function(e){ setBusy(btn,false); msg(e.message||'Upload failed','error'); });
  });

  function bindSave(){
    var btn = document.querySelector('.button-create .create-but');
    if (!btn) return;
    btn.addEventListener('click', function(){
      var title = $('#profile-title').value.trim();
      var location = $('#location').value.trim();
      var bio = $('#profile-bio').value.trim();
      var hourly = parseInt($('#profile-hourly').value, 10);
      if (isNaN(hourly)) hourly = undefined;
      var tog = document.getElementById('toggle');
      var availability = tog && tog.checked ? 'available' : undefined;
      var contactPreference = 'in-app';
      msg('Saving profile…','info');
      var payload = {
        skilledWorker: {
          professionalTitle: title || undefined,
          location: location || undefined,
          shortBio: bio || undefined,
          hourlyRate: hourly,
          availability: availability,
          contactPreference: contactPreference,
          primarySkills: primarySkillsState && primarySkillsState.length ? primarySkillsState : undefined
        }
      };
      patchProfile(payload, function(err, data){
        if (err){ msg(err.message||'Failed to save','error'); return; }
        msg('Profile saved','success');
        // reflect any server-side normalization
        try {
          var sw = data && data.user && data.user.skilledWorker;
          if (sw){
            primarySkillsState = Array.isArray(sw.primarySkills) ? sw.primarySkills.slice(0) : primarySkillsState;
            renderSkills(primarySkillsState);
            if (sw.profileImage) setImageBg(sw.profileImage);
          }
        } catch(_){ }
      });
    });
  }

  function initWorkerProfile(){
    console.log('Worker profile script init');
    // Only run on Worker profile section pages
    var section = document.querySelector('.section#profile');
    if(!section) {
      console.log('Profile section not found');
      return;
    }
    console.log('Profile section found, initializing...');
    // Render interactive placeholders immediately so UI works before data loads
    try {
      renderSkills(primarySkillsState);
      renderPortfolio(portfolioState);
      renderCerts(certsState);
    } catch(_){}
    loadMe();
    bindSave();
    bindUpload();
    bindPortfolioAdd();
    bindCertAdd();
    bindNinAdd();
    console.log('All bindings complete');
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initWorkerProfile);
  } else {
    // DOM already parsed; initialize immediately
    initWorkerProfile();
  }
})();
