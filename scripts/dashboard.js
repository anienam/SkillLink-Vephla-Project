(function(){
  // --- Reviews integration: load your review history and allow posting reviews ---
  function ensureApi(fn) {
    if (typeof callApi === 'function') return fn(callApi);
    var base = (typeof API_BASE !== 'undefined' && API_BASE) || '';
    function simple(path, method, body, useAuth, done) {
      var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (useAuth && typeof getToken === 'function') { var t = getToken(); if (t) headers['Authorization'] = 'Bearer ' + t; }
      fetch(base + path, { method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined })
        .then(function(r){ return r.json().catch(function(){return {};}).then(function(j){ return { ok:r.ok, data:j, statusText:r.statusText }; }); })
        .then(function(out){ if(!out.ok) return done(new Error((out.data&&(out.data.message||out.data.error))||out.statusText||'Request failed')); done(null, out.data); })
        .catch(done);
    }
    return fn(simple);
  }

  // Friendly error message sanitizer for UI
  function sanitizeMsg(raw){
    var s = String(raw||'');
    var lower = s.toLowerCase();
    if (/project is not completed/i.test(s)) return 'You can only review completed projects.';
    if (/validationerror/i.test(s)) return 'Some fields are invalid. Please check and try again.';
    if (/networkerror|failed to fetch/i.test(lower)) return 'Network error. Please try again.';
    if (/(unauthorized|forbidden|401|403)/i.test(s)) return 'Your session may have expired. Please sign in again.';
    if (/timeout|timed out/i.test(lower)) return 'Request timed out. Please try again.';
    if (s.length > 180 || /\n\s*at\s/.test(s)) return 'Something went wrong. Please try again.';
    return s;
  }

  function renderStars(rating){
    var n = Math.max(0, Math.min(5, Math.round(Number(rating)||0)));
    var s='';
    for (var i=0;i<5;i++) s += '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"><path fill="'+(i<n?'#ffa500':'#e5e7eb')+'" d="m12 17.275l-4.15 2.5q-.275.175-.575.15t-.525-.2t-.35-.437t-.05-.588l1.1-4.725L3.775 10.8q-.25-.225-.312-.513t.037-.562t.3-.45t.55-.225l4.85-.425l1.875-4.45q.125-.3.388-.45t.537-.15t.537.15t.388.45l1.875 4.45l4.85.425q.35.05.55.225t.3.45t.038.563t-.313.512l-3.675 3.175l1.1 4.725q.075.325-.05.588t-.35.437t-.525.2t-.575-.15z"/></svg>';
    return s;
  }

  // Render the logged-in user's review history (reviews they've posted)
  function renderReviewHistory(list){
    // Render only into the proper history tab container inside the Reviews page
    // Prefer the container within #page-hist, fallback to the first .comp-review-cont inside .section#review
    var root = document.querySelector('.section#review');
    var cont = root && root.querySelector('#page-hist .comp-review-cont');
    if (!cont) cont = root && root.querySelector('.comp-review-cont');
    if (!cont) return;
    cont.innerHTML = '';
    if (!list || !list.length){
      cont.innerHTML = '<div style="padding:16px; color:#888;">You have not posted any reviews yet.</div>';
      return;
    }
    list.forEach(function(rv){
      var who = (rv.reviewee && (rv.reviewee.name || rv.reviewee.companyName)) || 'Professional';
      var date = (rv.createdAt? new Date(rv.createdAt).toLocaleDateString() : '');
      var text = rv.publicFeedback || '';
      var proj = rv.project && rv.project.title ? rv.project.title : '';
      var item = document.createElement('div');
      item.className = 'comp-review-item';
      var left = document.createElement('div'); left.className = 'rev-review';
      var avatar = document.createElement('div'); avatar.className = 'rev-image';
      var info = document.createElement('div'); info.className = 'rev-info';
      var h2 = document.createElement('h2'); h2.textContent = who;
      var pRole = document.createElement('p'); pRole.textContent = proj || '';
      var pDate = document.createElement('p'); pDate.textContent = date || '';
      info.appendChild(h2); if (proj) info.appendChild(pRole); if (date) info.appendChild(pDate);
      left.appendChild(avatar); left.appendChild(info);
      var details = document.createElement('div'); details.className = 'rev-details';
      var stars = document.createElement('p'); stars.className = 'star-rating'; stars.innerHTML = renderStars(rv.rating);
      var body = document.createElement('p'); body.textContent = text;
      details.appendChild(stars); details.appendChild(body);
      item.appendChild(left); item.appendChild(details);
      cont.appendChild(item);
    });
  }

  function loadReviewHistory(){
    var cont = document.querySelector('.rev-client-cont'); if (cont) cont.innerHTML = '<div style="padding:16px; color:#666;">Loading your review history…</div>';
    ensureApi(function(api){
      api('/reviews/history/me', 'GET', null, true, function(err, data){
        if (err){ if (cont) cont.innerHTML = '<div style="padding:16px; color:#c00;">Failed to load reviews: '+(err.message||'Error')+'</div>'; return; }
        var list = (data && (data.reviews||data.items||data.data)) || [];
        renderReviewHistory(list);
      });
    });
  }

  // Modal to post a new review (select completed project, rating, public/private feedback)
  function openPostReviewModal(){
    closePostReviewModal();
    var overlay = document.createElement('div'); overlay.id='sl-review-overlay'; overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px;';
    var modal = document.createElement('div'); modal.id='sl-review-modal'; modal.style.cssText='background:#fff;border-radius:12px;max-width:560px;width:100%;box-shadow:0 10px 30px rgba(0,0,0,0.2);overflow:hidden;font-family:inherit;';
    var header = document.createElement('div'); header.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #eee;';
    header.innerHTML = '<h3 style="margin:0;font-size:18px;">Post a Review</h3><button type="button" style="background:none;border:none;font-size:18px;cursor:pointer">×</button>';
    var closeBtn = header.querySelector('button'); closeBtn.addEventListener('click', closePostReviewModal);
    var body = document.createElement('div'); body.style.cssText='padding:14px;display:grid;gap:10px;';
    body.innerHTML = ''+
      '<div id="sl-review-msg" class="msg" style="display:none"></div>'+
      '<label style="font-weight:600;">Select a completed project</label>'+
      '<div id="sl-review-projects" style="border:1px solid #eee;border-radius:8px;max-height:220px;overflow:auto;padding:8px;">'+
        '<div class="skl" style="display:grid;gap:8px;">'+
          '<div style="height:14px;background:#eee;border-radius:6px;width:60%"></div>'+
          '<div style="height:14px;background:#f2f2f2;border-radius:6px;width:40%"></div>'+
          '<div style="height:14px;background:#eee;border-radius:6px;width:50%"></div>'+
        '</div>'+
      '</div>'+
      '<label style="font-weight:600;">Rating (1-5)</label>'+
      '<input id="sl-review-rating" type="number" min="1" max="5" value="5" style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;" />'+
      '<label style="font-weight:600;">Public feedback</label>'+
      '<textarea id="sl-review-public" rows="3" placeholder="Great job!" style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;"></textarea>'+
      '<label style="font-weight:600;">Private feedback (visible only to the other party)</label>'+
      '<textarea id="sl-review-private" rows="2" placeholder="Would hire again." style="padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;"></textarea>';
    var footer = document.createElement('div'); footer.style.cssText='padding:12px 14px;border-top:1px solid #eee;display:flex;gap:10px;justify-content:flex-end;';
    var cancel = document.createElement('button'); cancel.textContent='Cancel'; cancel.className='create-but'; cancel.style.background='#eee'; cancel.style.color='#111'; cancel.addEventListener('click', closePostReviewModal);
    var submit = document.createElement('button'); submit.textContent='Submit Review'; submit.className='create-but'; submit.addEventListener('click', function(){
      var proj = document.querySelector('input[name="sl-review-proj"]:checked');
      var projectId = proj && proj.value;
      var rating = parseInt(document.getElementById('sl-review-rating').value, 10);
      var pub = (document.getElementById('sl-review-public').value||'').trim();
      var pri = (document.getElementById('sl-review-private').value||'').trim();
      var msgEl = document.getElementById('sl-review-msg');
      function showMsg(t, kind){ if(!msgEl) return; msgEl.textContent = sanitizeMsg(t||''); msgEl.className = 'msg ' + (kind||'info'); msgEl.style.display = t? 'block':'none'; }
      if (!projectId){ showMsg('Please select a completed project','error'); return; }
      if (!(rating>=1 && rating<=5)){ showMsg('Rating must be between 1 and 5','error'); return; }
      submit.disabled = true; submit.textContent = 'Submitting…';
      ensureApi(function(api){
        api('/reviews','POST',{ projectId: projectId, rating: rating, publicFeedback: pub, privateFeedback: pri }, true, function(err){
          submit.disabled=false; submit.textContent='Submit Review';
          if (err){ showMsg(err.message||'Failed to post review','error'); return; }
          closePostReviewModal();
          loadReviewHistory();
        });
      });
    });
    footer.appendChild(cancel); footer.appendChild(submit);
    modal.appendChild(header); modal.appendChild(body); modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Load employer completed projects (try multiple endpoints for robustness)
    ensureApi(function(api){
      var box = document.getElementById('sl-review-projects');
      function renderList(list){
        if (!box) return;
        if (!list || !list.length){ box.textContent = 'No completed projects found.'; return; }
        box.innerHTML = '';
        list.forEach(function(p){
          var proj = p.project || p; // support nested
          var id = proj._id || p._id || '';
          var title = proj.title || p.title || 'Untitled Project';
          var workerName = (proj.assignedTo && (proj.assignedTo.name || proj.assignedTo.fullName)) || '';
          var row = document.createElement('label'); row.style.display='grid'; row.style.gridTemplateColumns='18px 1fr'; row.style.gap='8px'; row.style.alignItems='center'; row.style.padding='6px 4px';
          row.innerHTML = '<input type="radio" name="sl-review-proj" value="'+id+'" /> <span>'+title + (workerName? (' • ' + workerName) : '') + '</span>';
          box.appendChild(row);
        });
      }
      // Helper to filter completed projects
      function onlyCompleted(arr){
        try { return (arr||[]).filter(function(x){ var pr = x.project || x; return String((pr && pr.status) || '').toLowerCase() === 'completed'; }); }
        catch(_){ return []; }
      }
      // Try projects with status query first
      api('/projects?status=completed','GET',null,true,function(err,data){
        if (!err){
          var list = (data && (data.items||data.projects||data.data)) || [];
          // Some backends ignore the filter; ensure client-side filtering
          var filtered = onlyCompleted(list);
          if (filtered && filtered.length) return renderList(filtered);
          // No items after filter – try plain /projects
          return api('/projects','GET',null,true,function(e2,d2){
            if (!e2){
              var list2 = (d2 && (d2.items||d2.projects||d2.data)) || [];
              var filtered2 = onlyCompleted(list2);
              if (filtered2 && filtered2.length) return renderList(filtered2);
            }
            // Final fallback to worker-completed legacy endpoint
            api('/workers/jobs/completed','GET',null,true,function(e3,d3){
              if (e3){ if (box) box.textContent='Failed to load projects'; return; }
              var list3 = (d3 && (d3.completedJobs||d3.items||d3.data)) || [];
              // Legacy may already be completed jobs; render as-is
              renderList(list3);
            });
          });
        }
        // If first call errored, try /projects then filter
        api('/projects','GET',null,true,function(e2,d2){
          if (!e2){
            var list2 = (d2 && (d2.items||d2.projects||d2.data)) || [];
            var filtered2 = onlyCompleted(list2);
            if (filtered2 && filtered2.length) return renderList(filtered2);
          }
          // Final fallback to worker-completed legacy endpoint
          api('/workers/jobs/completed','GET',null,true,function(e3,d3){
            if (e3){ if (box) box.textContent='Failed to load projects'; return; }
            var list3 = (d3 && (d3.completedJobs||d3.items||d3.data)) || [];
            renderList(list3);
          });
        });
      });
    });
  }
  function closePostReviewModal(){
    var ov = document.getElementById('sl-review-overlay'); if (ov) try{ ov.remove(); }catch(_){ document.body.removeChild(ov); }
  }

  function injectPostButton(){
    var section = document.querySelector('.section#review .content-page-details');
    if (!section) return;
    if (document.getElementById('sl-post-review-btn')) return;
    // Find the "Review History" title
    var h2s = section.querySelectorAll('h2');
    var titleEl = null; for (var i=0;i<h2s.length;i++){ if (/Review History/i.test(h2s[i].textContent||'')){ titleEl = h2s[i]; break; } }
    var btn = document.createElement('button');
    btn.id='sl-post-review-btn';
    btn.className='p-but1';
    btn.textContent='Leave a Review';
    btn.addEventListener('click', function(){
      // Scroll to in-page form and focus the select
      var form = document.querySelector('.review-cont');
      if (form && typeof form.scrollIntoView === 'function') form.scrollIntoView({ behavior:'smooth', block:'start' });
      try {
        var sel = document.querySelector('.review-cont select[name="review-select"]'); if (sel) sel.focus();
      } catch(_){ }
    });

    if (titleEl && titleEl.parentNode) {
      // Wrap title in a flex header and append button aligned right
      var wrap = document.createElement('div');
      wrap.className = 'review-history-header';
      wrap.style.display = 'flex';
      wrap.style.alignItems = 'center';
      wrap.style.justifyContent = 'space-between';
      // Preserve margins
      wrap.style.margin = getComputedStyle(titleEl).margin || '0 0 10px 0';
      titleEl.style.margin = '0';
      titleEl.parentNode.insertBefore(wrap, titleEl);
      wrap.appendChild(titleEl);
      wrap.appendChild(btn);
    } else {
      // Fallback: add at top
      btn.style.margin = '8px 0';
      section.prepend(btn);
    }
  }

  // Load and render rating summary for review page (avoid hardcoded values)
  function loadReviewSummary(){
    var root = document.querySelector('.section#review');
    if (!root) return;
    ensureApi(function(api){
      api('/workers/dashboard','GET',null,true,function(err,data){
        if (err) return; // keep placeholders if fails
        var s = (data && data.summary) || {};
        var rating = (typeof s.currentRating === 'number') ? s.currentRating : 0;
        var count = s.ratingCount != null ? s.ratingCount : (s.newProposals!=null ? s.newProposals : null);
        // Update number
        var numEl = root.querySelector('.review-rate .rate-num h2');
        if (numEl) numEl.textContent = (rating && !isNaN(rating)) ? rating.toFixed(1) : '0.0';
        // Update stars
        var starEl = root.querySelector('.review-rate .rate-num p');
        if (starEl) starEl.innerHTML = renderStars(Math.round(rating));
        // Update "Based on X reviews."
        var basedEl = (function(){
          var all = root.querySelectorAll('.review-rate > p');
          // choose the last <p> inside .review-rate per current structure
          return all && all.length ? all[all.length-1] : null;
        })();
        if (basedEl && count != null) basedEl.textContent = 'Based on ' + count + ' reviews.';
        // Progress bars: set relative to rating
        var progVal = Math.max(0, Math.min(100, Math.round((rating/5)*100)));
        root.querySelectorAll('.review-stat .r-stat progress').forEach(function(p){ p.value = progVal; });
      });
    });
  }

  // In-page review form support (Client Review UI)
  var reviewFormProjects = {}; // projectId -> { workerId, workerName }
  function fetchCompletedProjects(cb){
    ensureApi(function(api){
      function onlyCompleted(arr){
        try { return (arr||[]).filter(function(x){ var pr = x.project || x; return String((pr && pr.status) || '').toLowerCase() === 'completed'; }); }
        catch(_){ return []; }
      }
      api('/projects?status=completed','GET',null,true,function(err,data){
        if (!err){
          var list = (data && (data.items||data.projects||data.data)) || [];
          var filtered = onlyCompleted(list);
          if (filtered && filtered.length) return cb(null, filtered.map(function(p){ return p.project||p; }));
          // Try plain projects then filter
          return api('/projects','GET',null,true,function(e2,d2){
            if (!e2){
              var list2 = (d2 && (d2.items||d2.projects||d2.data)) || [];
              var filtered2 = onlyCompleted(list2);
              if (filtered2 && filtered2.length) return cb(null, filtered2.map(function(p){ return p.project||p; }));
            }
            // Legacy fallback
            api('/workers/jobs/completed','GET',null,true,function(e3,d3){
              if (e3) return cb(e3);
              var list3 = (d3 && (d3.completedJobs||d3.items||d3.data)) || [];
              // These are completed by definition
              return cb(null, list3.map(function(p){ return p.project||p; }));
            });
          });
        }
        // Error on first call, try plain
        api('/projects','GET',null,true,function(e2,d2){
          if (!e2){
            var list2 = (d2 && (d2.items||d2.projects||d2.data)) || [];
            var filtered2 = (list2||[]).filter(function(x){ var pr = x.project||x; return String((pr && pr.status)||'').toLowerCase()==='completed'; });
            if (filtered2 && filtered2.length) return cb(null, filtered2.map(function(p){ return p.project||p; }));
          }
          api('/workers/jobs/completed','GET',null,true,function(e3,d3){
            if (e3) return cb(e3);
            var list3 = (d3 && (d3.completedJobs||d3.items||d3.data)) || [];
            return cb(null, list3.map(function(p){ return p.project||p; }));
          });
        });
      });
    });
  }

  function populateReviewSelect(){
    var selectEl = document.querySelector('.review-cont select[name="review-select"]');
    if (!selectEl) return;
    // Keep first disabled placeholder, clear others
    var keepFirst = selectEl.querySelector('option');
    selectEl.innerHTML = '';
    if (keepFirst){
      var placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.disabled = true;
      placeholder.selected = true;
      placeholder.textContent = keepFirst.textContent || 'choose projects';
      selectEl.appendChild(placeholder);
    }
    fetchCompletedProjects(function(err, list){
      if (err){
        // Show a subtle message inline via title attr to avoid layout shift
        try { selectEl.title = 'Failed to load projects: ' + (err.message||'Error'); } catch(_){ }
        return;
      }
      if (!list || !list.length){
        var opt = document.createElement('option'); opt.value=''; opt.disabled=true; opt.textContent='No completed projects'; selectEl.appendChild(opt); return;
      }
      reviewFormProjects = {};
      list.forEach(function(p){
        var opt = document.createElement('option');
        opt.value = p._id || '';
        var workerName = (p.assignedTo && (p.assignedTo.name || p.assignedTo.fullName)) || '';
        var workerId = (p.assignedTo && (p.assignedTo._id || p.assignedTo.id)) || '';
        if (opt.value){ reviewFormProjects[opt.value] = { workerId: workerId || '', workerName: workerName || '' }; }
        if (workerId) opt.setAttribute('data-worker-id', workerId);
        opt.textContent = (p.title || 'Untitled Project') + (workerName? (' • ' + workerName) : '');
        selectEl.appendChild(opt);
      });
    });
  }

  function getStarInputs(){
    return [
      document.getElementById('check-rate'),
      document.getElementById('check-rate1'),
      document.getElementById('check-rate2'),
      document.getElementById('check-rate3'),
      document.getElementById('check-rate4')
    ].filter(Boolean);
  }

  function wireStarRating(){
    var stars = getStarInputs();
    if (!stars.length) return;
    function setRating(n){
      for (var i=0;i<stars.length;i++){ stars[i].checked = (i <= n-1); }
    }
    stars.forEach(function(cb, idx){
      cb.addEventListener('change', function(){
        // emulate radio-like behavior: first idx+1 checked
        if (cb.checked) setRating(idx+1); else setRating(idx); // allow toggling down
      });
      // Clicking the label triggers change on checkbox; extra click handler helps consistency
      try {
        var lbl = document.querySelector('label[for="'+cb.id+'"]');
        if (lbl) lbl.addEventListener('click', function(){ setRating(idx+1); });
      } catch(_){ }
    });
  }

  function currentRating(){
    var stars = getStarInputs();
    var n = 0; for (var i=0;i<stars.length;i++){ if (stars[i].checked) n = i+1; }
    return n;
  }

  function showReviewPageMsg(text, kind){
    var cont = document.querySelector('.review-cont .review-container') || document.querySelector('.review-cont');
    if (!cont) return;
    var id='sl-review-page-msg';
    var el = document.getElementById(id);
    if (!el){ 
      el = document.createElement('div'); 
      el.id=id; 
      el.className='msg'; 
      el.style.marginBottom='8px'; 
      el.style.padding='8px 12px';
      el.style.borderRadius='4px';
      el.style.fontSize='14px';
      cont.prepend(el); 
    }
    el.textContent = sanitizeMsg(text||'');
    el.className = 'msg ' + (kind||'info');
    // Style based on message type
    if (kind === 'error') {
      el.style.backgroundColor = '#fee'; 
      el.style.color = '#c53030'; 
      el.style.border = '1px solid #fc8181';
    } else if (kind === 'success') {
      el.style.backgroundColor = '#f0fff4'; 
      el.style.color = '#22543d'; 
      el.style.border = '1px solid #68d391';
    } else { // info
      el.style.backgroundColor = '#ebf8ff'; 
      el.style.color = '#2c5282'; 
      el.style.border = '1px solid #90cdf4';
    }
    el.hidden = !text;
  }

  function handlePageReviewSubmit(){
    var formWrap = document.querySelector('.review-cont');
    if (!formWrap) return;
    var submitBtn = formWrap.querySelector('.rev-button .rev-but1');
    var selectEl = formWrap.querySelector('select[name="review-select"]');
    var textarea = formWrap.querySelector('textarea[name="feedback"]');
    var privateBox = formWrap.querySelector('input[type="checkbox"][name="private"]');
    if (!submitBtn || !selectEl || !textarea) return;
    submitBtn.addEventListener('click', function(e){
      e.preventDefault();
      var projectId = selectEl.value || '';
      var rating = currentRating();
      var text = (textarea.value||'').trim();
      var isPrivate = !!(privateBox && privateBox.checked);
      if (!projectId){ showReviewPageMsg('Please select a completed project','error'); return; }
      if (!(rating>=1 && rating<=5)){ showReviewPageMsg('Rating must be between 1 and 5','error'); return; }
      if (!text){ showReviewPageMsg('Please write your feedback','error'); return; }
      var payload = { projectId: projectId, rating: rating };
      // Attach the associated worker as reviewee when available
      try {
        var workerMeta = reviewFormProjects[projectId];
        var optSel = selectEl.options[selectEl.selectedIndex];
        var workerId = (optSel && optSel.getAttribute('data-worker-id')) || (workerMeta && workerMeta.workerId) || '';
        if (workerId) payload.revieweeId = workerId;
      } catch(_){ }
      if (isPrivate){ payload.publicFeedback = ''; payload.privateFeedback = text; }
      else { payload.publicFeedback = text; payload.privateFeedback = ''; }
      submitBtn.disabled = true; var oldText = submitBtn.textContent; submitBtn.textContent = 'Submitting…';
      ensureApi(function(api){
        api('/reviews','POST', payload, true, function(err){
          submitBtn.disabled=false; submitBtn.textContent = oldText;
          if (err){ 
            var msg = err.message || 'Failed to post review';
            // Handle "already reviewed" case more gracefully
            if (msg.toLowerCase().includes('already reviewed')) {
              // Just hide the project from the dropdown and show a subtle message
              try {
                var opt = selectEl.options[selectEl.selectedIndex];
                if (opt) opt.style.display = 'none';
                selectEl.value = '';
              } catch(_) {}
              showReviewPageMsg('This project has already been reviewed. Please select another project.', 'info');
            } else {
              showReviewPageMsg(msg, 'error');
            }
            return; 
          }
          showReviewPageMsg('Review submitted successfully.','success');
          try { textarea.value=''; if (privateBox) privateBox.checked=false; getStarInputs().forEach(function(cb){ cb.checked=false; }); } catch(_){ }
          // Refresh the lists
          loadReviewHistory();
          // Repopulate completed projects (some UIs remove reviewed projects from list)
          populateReviewSelect();
        });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    var reviewSection = document.querySelector('.section#review');
    if (!reviewSection) return;
    injectPostButton();
    loadReviewSummary();
    loadReviewHistory();
    // Populate in-page form and wire interactions
    populateReviewSelect();
    wireStarRating();
    handlePageReviewSubmit();
    // Refresh when Reviews tab becomes active
    var tab = document.getElementById('tab-reviews');
    if (tab){
      if (tab.checked){ loadReviewHistory(); populateReviewSelect(); }
      tab.addEventListener('change', function(){ if (tab.checked){ loadReviewSummary(); loadReviewHistory(); populateReviewSelect(); } });
    }
    // Switchers for the inner review/history sub-tabs
    var tabLeave = document.getElementById('review-page');
    var tabHist = document.getElementById('rev-history-page');
    if (tabHist){ tabHist.addEventListener('change', function(){ if (tabHist.checked){ loadReviewHistory(); } }); }
    if (tabLeave){ tabLeave.addEventListener('change', function(){ if (tabLeave.checked){ populateReviewSelect(); } }); }
  });
})();
// Worker dashboard loader (novice-friendly)
// Uses callApi from auth.js and the meta sl-api-base already present in the HTML
(function(){
  function $(sel, root){ return (root||document).querySelector(sel); }
  function el(tag, cls){ var e=document.createElement(tag); if(cls) e.className=cls; return e; }
  function safe(n){ return (n==null)?0:n; }

  function showDashMsg(text, type){
    var header = $('.section#dashboard .content-page-details');
    if(!header) return;
    var id='dash-msg';
    var elMsg=document.getElementById(id);
    if(!elMsg){ elMsg=document.createElement('div'); elMsg.id=id; elMsg.className='msg'; header.prepend(elMsg); }
    elMsg.textContent = text||'';
    elMsg.className = 'msg ' + (type||'info');
    elMsg.hidden = !text;
  }

  function renderSummary(data){
    // Support both Client and Worker dashboard layouts
    var s = (data && data.summary) || {};

    // Client layout summary tiles
    var clientGrid = $('.section#dashboard .dashboard-grid');
    if (clientGrid){
      var tiles = clientGrid.querySelectorAll('.dashboard-grid-items');
      var active = (s.activeJobs!=null)? s.activeJobs : s.activeProjects;
      var pending = (s.pendingAction!=null)? s.pendingAction : s.pendingPayments;
      var proposals = (s.newProposals!=null)? s.newProposals : s.ratingCount;
      var messages = (s.messages!=null)? s.messages : s.newMessages;
      if(tiles[0]){ tiles[0].querySelector('p').textContent = String(safe(active)); }
      if(tiles[1]){ tiles[1].querySelector('p').textContent = String(safe(pending)); }
      if(tiles[2]){ tiles[2].querySelector('p').textContent = String(safe(proposals)); }
      if(tiles[3]){ tiles[3].querySelector('p').textContent = String(safe(messages)); }
      if (data && data.user && data.user.firstname){
        var hClient = $('.section#dashboard .dashboard-intro h2');
        if (hClient) hClient.textContent = 'Welcome, ' + data.user.firstname;
      }
    }

    // Worker layout summary tiles
    var workerHead = $('.section#dashboard .dash-head');
    if (workerHead){
      var activeProjects = (s.activeProjects!=null)? s.activeProjects : s.activeJobs;
      var pendingPayments = (s.pendingPayments!=null)? s.pendingPayments : s.pendingAction;
      var newMessages = (s.newMessages!=null)? s.newMessages : s.messages;
      var profileViews = safe(s.profileViews);
      var currentRating = s.currentRating!=null ? s.currentRating : 0;

      var items = workerHead.querySelectorAll('.dash-head-item');
      if (items[0]){
        var p0 = items[0].querySelector('.d-split p:last-child');
        if (p0) p0.textContent = String(safe(activeProjects)) + ' Active Projects';
      }
      if (items[0]){
        var prog = items[0].querySelector('progress');
        if (prog) prog.value = Math.max(0, Math.min(100, 65));
      }
      if (items[1]){ var n = items[1].querySelector('p'); if(n) n.textContent = String(safe(newMessages)); }
      if (items[2]){ var v = items[2].querySelector('p'); if(v) v.textContent = String(safe(profileViews)); }
      if (items[3]){ var r = items[3].querySelector('p'); if(r) r.textContent = String(safe(currentRating)); }
      var pend = workerHead.querySelector('.dash-pend p');
      if (pend) pend.textContent = String(safe(pendingPayments));

      var greet = $('.section#dashboard .dash-intro h1');
      if (greet && data && data.user && data.user.firstname) greet.textContent = 'Welcome, ' + data.user.firstname + '!';
    }
  }

  function renderRecentJobs(data){
    // Fill client and worker recent lists
    var jobs = (data && (data.activeJobs || data.recentJobs)) || [];
    // Client: two progress cards
    var list = $('.section#dashboard .dashboard-job');
    if(list){
      var items = list.querySelectorAll('.dashboard-job-items');
      for (var i=0; i<items.length; i++){
        var item = items[i];
        var j = jobs[i];
        if(!j) { item.style.display='none'; continue; }
        item.style.display='';
        var name = item.querySelector('.job-name');
        if(name){ name.textContent = (j.title||'Job'); }
        var prog = item.querySelector('progress');
        if(prog){ var v = (typeof j.progress==='number')?j.progress:0; prog.value = Math.max(0, Math.min(100, v)); }
      }
    }
    // Worker: list with dates and progress
    var wList = $('.section#dashboard .dash-body-item1 .dash-body-menu');
    if (wList){
      wList.innerHTML = '';
      for (var k=0; k<jobs.length; k++){
        var j2 = jobs[k];
        var row = el('div','dash-body-menu-items');
        var left = el('div','dash-name');
        var h2 = el('h2'); h2.textContent = j2.client || j2.clientName || 'Client';
        var p = el('p'); p.textContent = j2.title || 'Job';
        left.appendChild(h2); left.appendChild(p);
        var right = el('div','dash-prog');
        var dateP = el('p');
        try { var d = j2.date ? new Date(j2.date) : null; dateP.textContent = d? d.toLocaleDateString() : ''; } catch(e){ dateP.textContent=''; }
        var prog2 = document.createElement('progress'); prog2.min=0; prog2.max=100; prog2.value = Math.max(0, Math.min(100, (typeof j2.progress==='number')? j2.progress : 0));
        right.appendChild(dateP); right.appendChild(prog2);
        row.appendChild(left); row.appendChild(right);
        wList.appendChild(row);
      }
      if (!jobs.length){ var empty=el('div',''); empty.textContent='No recent jobs'; empty.style.padding='8px 10px'; wList.appendChild(empty); }
    }
  }

  function renderApplications(data){
    // Put a few recent applications/messages into .applicants-cont
    var msgs = (data && (data.recentApplications || data.latestMessages)) || [];
    // Client container
    var cont = $('.section#dashboard .applicants-cont');
    if(cont){
      // Clear and render
      cont.innerHTML = '';
      if (!msgs.length){
        var empty = document.createElement('div');
        empty.textContent = 'No recent applications';
        empty.style.padding = '8px 10px';
        empty.style.color = '#333';
        empty.style.fontSize = '14px';
        empty.style.background = 'transparent';
        cont.appendChild(empty);
      } else {
        for (var i=0; i<msgs.length; i++){
          var m = msgs[i];
          var row = document.createElement('div');
          row.className = 'recent-app-item';
          row.style.display = 'flex';
          row.style.alignItems = 'center';
          row.style.gap = '10px';
          row.style.padding = '8px 10px';
          row.style.border = '1px solid #f0f0f0';
          row.style.borderRadius = '8px';
          row.style.background = '#fff';

          var textEl = document.createElement('div');
          var who = m.applicant || m.worker || m.name || '';
          var about = m.projectTitle || m.title || '';
          var text = m.text || m.note || '';
          var line = (who? (who + ' • ') : '') + (about || 'Application') + (text? (': ' + text) : '');
          textEl.textContent = line;
          textEl.style.flex = '1';
          textEl.style.color = '#222';
          textEl.style.fontSize = '13px';
          row.appendChild(textEl);

          cont.appendChild(row);
        }
      }
    }

    // Worker container for latest messages
    var wCont = $('.section#dashboard .dash-body-item2 .dash-body-mes');
    if (wCont){
      wCont.innerHTML = '';
      // prevent horizontal overflow on the container
      try { wCont.style.overflowX = 'hidden'; } catch(e){}
      function resolveImg(url, pid){
        try { if (window.SLMedia && SLMedia.resolveUrl) return SLMedia.resolveUrl(url||'', pid||''); } catch(_){}
        return url||'';
      }
      function nameOf(u){
        if(!u) return '';
        var n = '';
        if (u.firstname || u.lastname) n = [(u.firstname||''),(u.lastname||'')].join(' ').trim();
        if (!n) n = u.name || u.username || u.email || '';
        return n;
      }
      function avatarOf(u){
        if(!u) return '';
        // Prefer direct fields from dashboard.sender
        var url = u.avatar || u.profileImage || '';
        var pid = u.cloudinaryId || '';
        // Fallback to nested skilledWorker when present
        try {
          if (!url && u.skilledWorker) { url = u.skilledWorker.profileImage || ''; pid = u.skilledWorker.cloudinaryId || pid; }
        } catch(_){}
        return resolveImg(url, pid);
      }
      function timeOf(ts){ try { var d = ts? new Date(ts) : null; return d? d.toLocaleString() : ''; } catch(e){ return ''; } }
      function letterAvatar(name){
        var c = document.createElement('div');
        c.style.width='36px'; c.style.height='36px'; c.style.borderRadius='50%'; c.style.display='grid'; c.style.placeItems='center';
        c.style.background='#e5e7eb'; c.style.color='#111827'; c.style.fontWeight='700'; c.style.fontSize='12px';
        var t = (name||'').trim(); var ch = t? t.charAt(0).toUpperCase() : '?'; c.textContent = ch;
        return c;
      }
      if (!msgs.length){ var e2=document.createElement('div'); e2.textContent='No messages'; e2.style.padding='8px 10px'; wCont.appendChild(e2); }
      for (var j=0; j<msgs.length; j++){
        var mm = msgs[j];
        var item = document.createElement('div'); item.className='dash-body-mes-item';
        // Try to avoid layout breaks
        try { item.style.overflowX = 'hidden'; } catch(e){}
        var fold = document.createElement('div'); fold.className='dash-fold';
        var prof = document.createElement('p'); prof.className='dash-mes-prof';
        // make avatar bubble size consistent and circular
        try { prof.style.width='36px'; prof.style.height='36px'; prof.style.borderRadius='50%'; prof.style.backgroundSize='cover'; prof.style.backgroundPosition='center'; prof.style.flex='0 0 auto'; } catch(e){}
        var sender = mm.sender || mm.user || mm.from || null;
        var whoName = nameOf(sender);
        var avatar = avatarOf(sender);
        if (avatar){
          prof.style.backgroundImage = "url('"+avatar+"')";
        } else {
          // fallback letter avatar
          prof.style.backgroundImage = 'none';
          var fa = letterAvatar(whoName);
          // replace <p> with a div avatar when no image available
          try { prof.replaceWith(fa); prof = fa; } catch(_){ }
        }
        var info = document.createElement('div'); info.className='dash-mes-info';
        try { info.style.minWidth='0'; info.style.overflow='hidden'; } catch(e){}
        var h2 = document.createElement('h2'); h2.textContent = mm.projectTitle || mm.project || 'Project';
        var meta = document.createElement('div');
        var when = timeOf(mm.createdAt || mm.time || mm.date);
        meta.textContent = (whoName||'') + (when? (' • ' + when) : '');
        try { meta.style.fontSize='12px'; meta.style.color='#6b7280'; meta.style.marginTop='2px'; meta.style.whiteSpace='nowrap'; meta.style.textOverflow='ellipsis'; meta.style.overflow='hidden'; } catch(e){}
        var p = document.createElement('p');
        var msgText = mm.text || mm.message || mm.note || '';
        // Simple linkify: wrap http/https URLs with anchors
        try {
          var urlRe = /(https?:\/\/[^\s]+)/g;
          var parts = String(msgText).split(urlRe);
          p.innerHTML = '';
          for (var xi=0; xi<parts.length; xi++){
            var part = parts[xi];
            if (!part) continue;
            if (urlRe.test(part)){
              var a = document.createElement('a'); a.href = part; a.textContent = part; a.target = '_blank'; a.rel='noopener';
              a.style.color = '#2563eb'; a.style.textDecoration='underline';
              p.appendChild(a);
            } else {
              p.appendChild(document.createTextNode(part));
            }
          }
        } catch(_) {
          p.textContent = msgText;
        }
        // wrap long words/URLs nicely
        try {
          p.style.whiteSpace='normal';
          p.style.overflowWrap='anywhere';
          p.style.wordBreak='break-word';
          p.style.color = '#111827';
        } catch(e){}
        info.appendChild(h2); info.appendChild(p);
        // insert sender + time line before message body when present
        if (whoName || (mm.createdAt||mm.time||mm.date)){ info.insertBefore(meta, p); }
        fold.appendChild(prof); fold.appendChild(info);
        var arrow = document.createElement('p'); arrow.className='ang-right';
        item.appendChild(fold); item.appendChild(arrow);
        wCont.appendChild(item);
      }
    }
  }

  function renderOngoing(data){
    // Use the footer Pending Actions (employer) or ongoingJobs (worker)
    var ongoing = (data && (data.pendingActions || data.ongoingJobs)) || [];
    // Client footer block
    var wrap = $('.section#dashboard .dash-footer1');
    if(wrap){
      var items = wrap.querySelectorAll('.pend-act-item');
      for (var i=0; i<items.length; i++){
        var item = items[i];
        var og = ongoing[i];
        if(!og){ item.style.display='none'; continue; }
        item.style.display='';
        var t = item.querySelector('p:nth-child(2)');
        if (t) t.textContent = og.label || og.title || 'Pending';
      }
    }
    // Worker ongoing jobs block
    var wWrap = $('.section#dashboard .dash-body-item3 .dash-on');
    if (wWrap){
      wWrap.innerHTML = '';
      for (var j=0; j<ongoing.length; j++){
        var og2 = ongoing[j];
        var row = document.createElement('div'); row.className='dash-on-item';
        var info = document.createElement('div'); info.className='dash-on-info';
        var h2 = document.createElement('h2'); h2.innerHTML = 'Job: <span>' + (og2.title || 'Job') + '</span>';
        var p = document.createElement('p');
        try { var d = og2.deadline ? new Date(og2.deadline) : null; p.textContent = 'Deadline: ' + (d? d.toLocaleDateString() : ''); } catch(e){ p.textContent=''; }
        info.appendChild(h2); info.appendChild(p);
        var prog = document.createElement('progress'); prog.min=0; prog.max=100; prog.value = Math.max(0, Math.min(100, (typeof og2.progress==='number')? og2.progress : 0));
        row.appendChild(info); row.appendChild(prog);
        wWrap.appendChild(row);
      }
      if (!ongoing.length){ var em=document.createElement('div'); em.textContent='No ongoing jobs'; em.style.padding='8px 10px'; wWrap.appendChild(em); }
    }
  }

  function renderEarnings(data){
    var er = data && data.earningsReview;
    var cont = $('.section#dashboard .dash-body-item4 .dash-chart');
    if (!cont || !er || !Array.isArray(er.series)) return;
    cont.innerHTML = '';
    var canvas = document.createElement('canvas');
    canvas.width = 280; canvas.height = 180;
    cont.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    if (!ctx){
      var fallback = document.createElement('div'); fallback.textContent = er.series.map(function(s){ return s.label+': '+s.value; }).join(' | ');
      cont.appendChild(fallback); return;
    }
    var pad = { l:24, r:8, t:8, b:24 };
    var w = canvas.width - pad.l - pad.r;
    var h = canvas.height - pad.t - pad.b;
    var n = er.series.length;
    var max = 0; for (var i=0;i<n;i++){ if (er.series[i].value>max) max=er.series[i].value; }
    max = max || 1;
    var barW = Math.max(8, Math.floor(w / (n*1.5)));
    var gap = Math.floor((w - barW*n) / (n-1 || 1));
    // axes
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t+h); ctx.lineTo(pad.l+w, pad.t+h); ctx.stroke();
    // bars
    for (var j=0;j<n;j++){
      var v = er.series[j].value;
      var bh = Math.round((v/max) * (h-2));
      var x = pad.l + j*(barW+gap);
      var y = pad.t + h - bh;
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(x, y, barW, bh);
      // labels
      ctx.fillStyle = '#111827'; ctx.font = '10px sans-serif'; ctx.textAlign='center';
      ctx.fillText(er.series[j].label, x + barW/2, pad.t + h + 14);
    }
  }

  function loadDashboard(){
    // Determine whether this is Worker dashboard page; only run when Dashboard tab is visible
    var section = document.querySelector('.section#dashboard');
    if(!section) return;
    showDashMsg('Loading dashboard…','info');
    var isWorker = /Worker/i.test(document.title || '') || !!document.querySelector('.dash-head');
    // Prefer global callApi
    var fetcher = (typeof callApi==='function') ? callApi : function(path,method,body,useAuth,done){
      var base = (typeof API_BASE!=='undefined' && API_BASE) || '';
      var headers = { 'Accept':'application/json','Content-Type':'application/json' };
      if (useAuth && typeof getToken==='function'){
        var t = getToken(); if(t) headers['Authorization'] = 'Bearer ' + t;
      }
      fetch(base+path,{ method: method||'GET', headers: headers, body: body?JSON.stringify(body):undefined })
        .then(function(r){ return r.json().catch(function(){return {}; }).then(function(j){ return { ok:r.ok, data:j, statusText:r.statusText }; }); })
        .then(function(out){ if(!out.ok) return done(new Error((out.data&&out.data.message)||out.statusText||'Failed')); done(null,out.data); })
        .catch(done);
    };

    // Choose order by page type
    if (isWorker){
      fetcher('/workers/dashboard','GET',null,true,function(err2,data2){
          if(err2){ showDashMsg(err2.message||'Failed to load dashboard','error'); return; }
          showDashMsg('', '');
      try { renderSummary(data2); renderRecentJobs(data2); renderApplications(data2); renderOngoing(data2); renderEarnings(data2); } catch(e){}
      });
    } else {
      // Employer first, fallback to worker
      fetcher('/employers/dashboard','GET',null,true,function(err,data){
        if(err){
          return fetcher('/workers/dashboard','GET',null,true,function(err2,data2){
            if(err2){ showDashMsg(err2.message||'Failed to load dashboard','error'); return; }
            showDashMsg('', '');
            try { renderSummary(data2); renderRecentJobs(data2); renderApplications(data2); renderOngoing(data2); renderEarnings(data2); } catch(e){}
          });
        }
        showDashMsg('', '');
        try { renderSummary(data); renderRecentJobs(data); renderApplications(data); renderOngoing(data); renderEarnings(data); } catch(e){}
      });
    }
  }

  function wireTab(){
    var tab = document.getElementById('tab-dashboard');
    if(!tab){ loadDashboard(); return; }
    if (tab.checked) loadDashboard();
    tab.addEventListener('change', function(){ if(tab.checked) loadDashboard(); });
  }

  document.addEventListener('DOMContentLoaded', function(){
    // Only run on Client/Worker pages that have dashboard section
    var dash = document.querySelector('.section#dashboard');
    if(!dash) return;
    // Load current user (simple header/name population) without overengineering
    (function loadUserHeader(){
      // prefer existing callApi helper if available
      var updateUI = function(u){
        if(!u) return;
        var displayName = u.name || [u.firstname, u.lastname].filter(Boolean).join(' ') || u.firstname || u.email || '';
        if(!displayName) return;
        // Header account name(s)
        var nameEls = document.querySelectorAll('.content-page-header .account-name');
        nameEls.forEach(function(el){ el.textContent = displayName; });
        // Client dashboard greeting (h2)
        var clientGreet = document.querySelector('.section#dashboard .dashboard-intro h2');
        if (clientGreet) clientGreet.textContent = 'Welcome, ' + (u.firstname || displayName);
        // Worker dashboard greeting (h1)
        var workerGreet = document.querySelector('.section#dashboard .dash-intro h1');
        if (workerGreet) workerGreet.textContent = 'Welcome, ' + (u.firstname || displayName) + '!';

        // --- Avatar fallback ---
        function pickAvatarUrl(obj){
          return obj && (obj.avatarUrl || obj.photo || obj.image || obj.profileImage || obj.profilePic || (obj.employer&&obj.employer.logo));
        }
        function initials(name){
          var parts = (name||'').trim().split(/\s+/).filter(Boolean);
            if(!parts.length) return '';
            var first = parts[0].charAt(0).toUpperCase();
            var second = parts.length>1 ? parts[parts.length-1].charAt(0).toUpperCase() : '';
            return (first+second).slice(0,2);
        }
        function applyLetterAvatar(el, txt){
          if(!el) return;
          el.textContent = txt;
          el.style.background = '#0d9488';
          el.style.color = '#fff';
          el.style.display = 'flex';
          el.style.alignItems = 'center';
          el.style.justifyContent = 'center';
          el.style.fontWeight = '600';
          el.style.fontSize = '14px';
        }
        var avatarUrl = pickAvatarUrl(u);
        var avatarEls = document.querySelectorAll('.content-page-header .profile-image, .dash-prof-image');
        avatarEls.forEach(function(el){
          if(avatarUrl){
            el.style.backgroundImage = 'url("'+avatarUrl+'");';
            el.style.backgroundSize = 'cover';
            el.style.backgroundPosition = 'center';
          } else {
            el.style.backgroundImage = 'none';
            applyLetterAvatar(el, initials(displayName));
          }
        });
      };
      var done = function(err, data){ try { updateUI(data && data.user); } catch(_){ } };
      try {
        if (typeof callApi === 'function') {
          callApi('/auth/me','GET',null,true,done);
          return;
        }
      } catch(_){ }
      // Fallback simple fetch using meta production base
      try {
        var base = (typeof API_BASE !== 'undefined' && API_BASE) || (document.querySelector('meta[name="sl-api-base"]')||{}).content || '';
        var headers = { 'Accept':'application/json' };
        if (typeof getToken === 'function'){ var t = getToken(); if (t) headers.Authorization = 'Bearer ' + t; }
        fetch(base + '/auth/me', { headers: headers })
          .then(function(r){ return r.json().catch(function(){ return {}; }); })
          .then(function(j){ done(null,j); })
          .catch(function(e){ done(e); });
      } catch(_){ }
    })();
    wireTab();
  });
})();
