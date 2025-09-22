// Payments & Finance: employer wallet overview, history, pay worker, deposit
(function(){
  function $(sel, root){ return (root||document).querySelector(sel); }
  function $all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }

  // Prefer global callApi from auth.js; fallback to local fetcher
  function ensureApi(fn){
    if (typeof callApi === 'function') return fn(callApi);
    var base = (typeof API_BASE !== 'undefined' && API_BASE) || (function(){
      var meta = document.querySelector('meta[name="sl-api-base"]');
      return (meta && meta.content) || '';
    })();
    function simple(path, method, body, useAuth, done){
      var headers = { 'Accept':'application/json','Content-Type':'application/json' };
      if (useAuth && typeof getToken === 'function'){
        var t = getToken(); if (t) headers['Authorization'] = 'Bearer ' + t;
      }
      fetch(base + path, { method: method||'GET', headers: headers, body: body?JSON.stringify(body):undefined })
        .then(function(r){
          var ct = r.headers.get('content-type')||'';
          var p = ct.indexOf('application/json') !== -1 ? r.json() : r.text().then(function(t){ return { message: t }; });
          return p.then(function(j){ return { ok:r.ok, data:j, statusText:r.statusText }; });
        })
        .then(function(out){ if(!out.ok) return done(new Error((out.data && (out.data.message||out.data.error)) || out.statusText || 'Request failed')); done(null, out.data); })
        .catch(done);
    }
    return fn(simple);
  }

  function formatCurrency(amount, currency){
    if (amount == null || isNaN(amount)) return '';
    var code = (currency || 'NGN').toUpperCase();
    try { return new Intl.NumberFormat(undefined, { style:'currency', currency: code, maximumFractionDigits: 0 }).format(Number(amount)); }
    catch(e){ return code + ' ' + String(amount); }
  }

  function asDateText(s){
    if (!s) return '';
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    try { return d.toLocaleDateString(undefined, { year:'numeric', month:'short', day:'2-digit' }); }
    catch(e){ return d.toDateString(); }
  }

  function showPayMsg(text, type){
    var parent = $('.section#payment .content-page-details');
    if(!parent) return;
    var id = 'payments-msg';
    var el = document.getElementById(id);
    if(!el){ el = document.createElement('div'); el.id = id; el.className = 'msg'; parent.prepend(el); }
    el.textContent = text || '';
    el.className = 'msg ' + (type || 'info');
    el.hidden = !text;
  }

  // API calls
  function getPaymentOverview(cb){ ensureApi(function(api){ api('/employers/payments/overview','GET',null,true,cb); }); }
  function getPaymentHistory(cb){ ensureApi(function(api){ api('/employers/payments/history','GET',null,true,cb); }); }
  function payWorker(projectId, eventId, amount, cb){
    ensureApi(function(api){ api('/employers/projects/' + encodeURIComponent(projectId) + '/payments','POST',{ eventId: eventId, amount: amount }, true, cb); });
  }
  function depositWallet(amount, cb){ ensureApi(function(api){ api('/employers/wallet/deposit','POST',{ amount: amount }, true, cb); }); }

  // Rendering
  function renderOverview(data){
    var over = $('#page-overview');
    if(!over) return;
    var acc = (data && data.accountBalance) || 0;
    var spent = (data && data.totalSpent) || 0;
    var pending = (data && data.pendingPayments) || 0;

    var blocks = $all('.pay-cont .pay-items .pay-balance h2', over);
    if (blocks[0]) blocks[0].textContent = formatCurrency(acc, 'NGN');
    if (blocks[1]) blocks[1].textContent = formatCurrency(spent, 'NGN');
    if (blocks[2]) blocks[2].textContent = formatCurrency(pending, 'NGN');
  }

  function clearHistoryList(container){
    if(!container) return;
    // Preserve the H2 and the header row if present, then remove following .payment-tran rows
    var rows = $all('.payment-tran', container);
    rows.forEach(function(r){ r.parentNode && r.parentNode.removeChild(r); });
  }

  function addHistoryRow(container, item){
    var row = document.createElement('div');
    row.className = 'payment-tran';
    var status = (item.status || '').toLowerCase();
    row.innerHTML = ''+
      '<p>' + asDateText(item.date) + '</p>'+
      '<p>' + (item.worker || '-') + '</p>'+
      '<p>' + (item.project || '-') + '</p>'+
      '<p>' + formatCurrency(item.amount, 'NGN') + '</p>'+
      '<p class="' + (status === 'completed' ? 'comp' : 'pend') + '">' + (item.status || '-') + '</p>';
    container.appendChild(row);
  }

  function renderHistory(data){
    var list = (data && (data.history || data.data || [])) || [];
    var overviewList = $('#page-overview .pay-history-cont');
    var pageList = $('#page-history .pay-history-cont');
    [overviewList, pageList].forEach(function(container){
      if(!container) return;
      clearHistoryList(container);
      if (!list.length){
        var empty = document.createElement('div');
        empty.className = 'payment-tran';
        empty.innerHTML = '<p colspan="5" style="grid-column:1/-1;color:#555">No payments yet.</p>';
        container.appendChild(empty);
        return;
      }
      list.forEach(function(item){ addHistoryRow(container, item); });
    });
  }

  // Loaders
  function loadPaymentOverview(){
    showPayMsg('Loading payments overview…', 'info');
    getPaymentOverview(function(err, data){
      if (err){ showPayMsg(err.message || 'Failed to load overview', 'error'); return; }
      showPayMsg('', '');
      renderOverview(data);
      // Also refresh latest history snapshot
      getPaymentHistory(function(e2, d2){ if(!e2) renderHistory(d2); });
    });
  }

  function loadPaymentHistory(){
    showPayMsg('Loading payment history…', 'info');
    getPaymentHistory(function(err, data){
      if (err){ showPayMsg(err.message || 'Failed to load history', 'error'); return; }
      showPayMsg('', '');
      renderHistory(data);
    });
  }

  // Simple flows
  // ------- Make Payment Modal -------
  function fetchEmployerProjects(cb){
    ensureApi(function(api){
      api('/projects','GET',null,true,function(err,data){
        if (err) return cb(err);
        var list = (data && (data.projects || data.data || [])) || [];
        // Prefer ongoing/active projects first
        var filtered = list.filter(function(p){
          var st = (p.status||'').toLowerCase();
          return st !== 'completed' && st !== 'cancelled' && st !== 'archived';
        });
        // Fallback to all if filter empties
        cb(null, filtered.length ? filtered : list);
      });
    });
  }

  function pickEventIdFromProject(p){
    // Try common shapes: p.events[], p.milestones[], pick approved first else first
    if (!p) return null;
    var ev = Array.isArray(p.events) ? p.events : [];
    if (ev.length){
      var appr = ev.find(function(e){ return (e.status||'').toLowerCase() === 'approved'; });
      return (appr && (appr._id || appr.id)) || (ev[0] && (ev[0]._id || ev[0].id)) || null;
    }
    var ms = Array.isArray(p.milestones) ? p.milestones : [];
    if (ms.length){
      var apprM = ms.find(function(m){ return (m.status||'').toLowerCase() === 'approved'; });
      return (apprM && (apprM._id || apprM.id)) || (ms[0] && (ms[0]._id || ms[0].id)) || null;
    }
    return null;
  }

  function ensureModalStyle(){
    if (document.getElementById('sl-pay-modal-style')) return;
  var css = '\nbody.sl-modal-open{overflow:hidden!important}\n.sl-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;z-index:20001;backdrop-filter:saturate(120%) blur(1px)}\n.sl-modal{position:relative;background:#fff;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.15);width:min(560px,92vw);max-height:90vh;overflow:auto;z-index:20002;transform:none}\n.sl-modal .sl-header{padding:14px 18px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;background:#fff;border-top-left-radius:12px;border-top-right-radius:12px}\n.sl-modal .sl-header h3{margin:0;font-size:18px;color:#111}\n.sl-modal .sl-body{padding:16px 18px;display:grid;gap:14px}\n.sl-field{display:grid;gap:6px}\n.sl-field label{font-size:13px;color:#444}\n.sl-field select,.sl-field input{padding:10px 12px;border:1px solid #ddd;border-radius:8px;font-size:14px;background:#fff;color:#111}\n.sl-hint{font-size:12px;color:#777}\n.sl-actions{display:flex;justify-content:flex-end;gap:10px;padding:14px 18px;border-top:1px solid #eee}\n.sl-btn{padding:10px 14px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer;font-size:14px}\n.sl-btn.primary{background:#2f6feb;color:#fff;border-color:#2f6feb}\n.sl-btn[disabled]{opacity:.6;cursor:not-allowed}\n@media (max-width: 480px){.sl-modal{width:min(96vw,560px);max-height:96vh;border-radius:10px}}\n';
    var style = document.createElement('style');
    style.id = 'sl-pay-modal-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function showMakePaymentModal(){
    ensureModalStyle();
    var overlay = document.createElement('div');
    overlay.className = 'sl-modal-overlay';

    var modal = document.createElement('div');
    modal.className = 'sl-modal';
    modal.innerHTML = ''+
      '<div class="sl-header"><h3>Make Payment</h3><button class="sl-btn" id="sl-close">Close</button></div>'+
      '<div class="sl-body">'+
        '<div class="sl-field">'+
          '<label for="sl-project">Select ongoing project</label>'+
          '<select id="sl-project"><option value="" disabled selected>Loading projects…</option></select>'+
        '</div>'+
        '<div class="sl-field">'+
          '<label for="sl-amount">Amount (NGN)</label>'+
          '<input id="sl-amount" type="number" min="0" step="1" placeholder="e.g., 1000" />'+
        '</div>'+
        '<div class="sl-field">'+
          '<label for="sl-event" style="display:flex;align-items:center;gap:6px">Milestone / Event ID <span class="sl-hint">(auto-selected when possible)</span></label>'+
          '<input id="sl-event" type="text" placeholder="Auto pick; override if needed" />'+
        '</div>'+
        '<p class="sl-hint" id="sl-worker-hint"></p>'+
      '</div>'+
      '<div class="sl-actions">'+
        '<button class="sl-btn" id="sl-cancel">Cancel</button>'+
        '<button class="sl-btn primary" id="sl-submit">Send Payment</button>'+
      '</div>';
    overlay.appendChild(modal);

  function close(){ document.body.classList.remove('sl-modal-open'); document.body.removeChild(overlay); }
    modal.querySelector('#sl-close').addEventListener('click', close);
    modal.querySelector('#sl-cancel').addEventListener('click', close);
    overlay.addEventListener('click', function(e){ if(e.target === overlay) close(); });
    document.addEventListener('keydown', function esc(ev){ if(ev.key==='Escape'){ close(); document.removeEventListener('keydown', esc); } });

    var projectSelect = modal.querySelector('#sl-project');
    var amountInput = modal.querySelector('#sl-amount');
    var eventInput = modal.querySelector('#sl-event');
    var workerHint = modal.querySelector('#sl-worker-hint');
    var submitBtn = modal.querySelector('#sl-submit');

    var projectMap = {};

    // Load projects into select
    fetchEmployerProjects(function(err, projects){
      projectSelect.innerHTML = '';
      if (err){
        var opt = document.createElement('option');
        opt.value = ''; opt.disabled = true; opt.selected = true; opt.textContent = 'Failed to load projects';
        projectSelect.appendChild(opt);
        return;
      }
      if (!projects || !projects.length){
        var opt2 = document.createElement('option');
        opt2.value=''; opt2.disabled = true; opt2.selected = true; opt2.textContent = 'No projects available';
        projectSelect.appendChild(opt2);
        return;
      }
      var firstId = '';
      projects.forEach(function(p, idx){
        var id = p._id || p.id || String(idx);
        projectMap[id] = p;
        var label = (p.title || 'Untitled') + (p.assignedTo && p.assignedTo.name ? (' • ' + p.assignedTo.name) : '');
        var opt = document.createElement('option');
        opt.value = id; opt.textContent = label;
        if (idx === 0) firstId = id;
        projectSelect.appendChild(opt);
      });
      // Select first and seed event
      if (firstId){
        projectSelect.value = firstId;
        var proj = projectMap[firstId];
        var evId = pickEventIdFromProject(proj);
        if (evId) eventInput.value = evId;
        var wname = proj && proj.assignedTo && (proj.assignedTo.name || proj.assignedTo.firstname || proj.assignedTo.lastname) ? (proj.assignedTo.name || (proj.assignedTo.firstname + ' ' + (proj.assignedTo.lastname||''))) : '';
        workerHint.textContent = wname ? ('Paying worker: ' + wname) : '';
      }
    });

    projectSelect.addEventListener('change', function(){
      var proj = projectMap[projectSelect.value];
      var evId = pickEventIdFromProject(proj);
      eventInput.value = evId || '';
      var wname = proj && proj.assignedTo && (proj.assignedTo.name || proj.assignedTo.firstname || proj.assignedTo.lastname) ? (proj.assignedTo.name || (proj.assignedTo.firstname + ' ' + (proj.assignedTo.lastname||''))) : '';
      workerHint.textContent = wname ? ('Paying worker: ' + wname) : '';
    });

    submitBtn.addEventListener('click', function(){
      var pid = projectSelect.value;
      var amt = Number(amountInput.value);
      var evId = (eventInput.value||'').trim();
      if (!pid){ alert('Please select a project'); return; }
      if (!(amt > 0)){ alert('Enter a valid amount'); return; }
      if (!evId){
        // Try to auto-pick once more
        var p = projectMap[pid];
        evId = pickEventIdFromProject(p) || '';
        if (!evId){ alert('A milestone/event ID is required by the server. Please provide one.'); return; }
      }
      submitBtn.disabled = true;
      showPayMsg('Sending payment…','info');
      payWorker(pid, evId, amt, function(err, data){
        submitBtn.disabled = false;
        if (err){ showPayMsg(err.message || 'Payment failed', 'error'); return; }
        close();
        showPayMsg('Payment sent to worker.', 'success');
        loadPaymentOverview();
      });
    });

  document.body.classList.add('sl-modal-open');
  document.body.appendChild(overlay);
  }

  function payWorkerFlow(){
    showMakePaymentModal();
  }

  function depositFlow(){
    var amtStr = window.prompt('Enter amount to deposit (NGN):');
    if (!amtStr) return;
    var amt = Number(amtStr);
    if (isNaN(amt)) { alert('Amount must be a number'); return; }
    showPayMsg('Processing deposit…', 'info');
    depositWallet(amt, function(err, data){
      if (err){ showPayMsg(err.message || 'Deposit failed', 'error'); return; }
      showPayMsg('Deposit successful.', 'success');
      loadPaymentOverview();
    });
  }

  function wirePaymentsPage(){
    var section = document.querySelector('.section#payment');
    if (!section) return;

    var paymentsTab = document.getElementById('tab-payments');
    function trigger(){
      loadPaymentOverview();
      var historyRadio = document.getElementById('history-page');
      if (historyRadio && historyRadio.checked) loadPaymentHistory();
    }
    if (!paymentsTab || paymentsTab.checked) trigger();
    if (paymentsTab) paymentsTab.addEventListener('change', function(){ if (paymentsTab.checked) trigger(); });

    var overviewRadio = document.getElementById('overview-page');
    var historyRadio = document.getElementById('history-page');
    if (overviewRadio) overviewRadio.addEventListener('change', function(){ if (overviewRadio.checked) loadPaymentOverview(); });
    if (historyRadio) historyRadio.addEventListener('change', function(){ if (historyRadio.checked) loadPaymentHistory(); });

    var makeBtn = section.querySelector('.payment-button .pay-but1');
    if (makeBtn) makeBtn.addEventListener('click', payWorkerFlow);

    // Optional: expose quick deposit via console
    try { window.SkillLinkPayments = { refresh: loadPaymentOverview, history: loadPaymentHistory, pay: payWorkerFlow, deposit: depositFlow }; } catch(e){}
  }

  document.addEventListener('DOMContentLoaded', wirePaymentsPage);
})();
