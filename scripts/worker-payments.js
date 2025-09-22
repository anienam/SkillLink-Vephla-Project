// Worker Payments & Finance: Overview + History (novice-style)
(function(){
  function $(sel, root){ return (root||document).querySelector(sel); }
  function el(tag, cls){ var e=document.createElement(tag); if(cls) e.className=cls; return e; }

  function ensureApi(fn){
    if (typeof callApi === 'function') return fn(callApi);
    var base = (function(){ var m=document.querySelector('meta[name="sl-api-base"]'); return (m && m.content) || ''; })();
    function simple(path, method, body, useAuth, done){
      var headers={ 'Accept':'application/json','Content-Type':'application/json' };
      if (useAuth && typeof getToken === 'function'){ var t=getToken(); if(t) headers['Authorization']='Bearer '+t; }
      fetch(base + path, { method: method||'GET', headers: headers, body: body? JSON.stringify(body): undefined })
        .then(function(r){ return r.json().catch(function(){return {};}).then(function(j){ return { ok:r.ok, data:j, statusText:r.statusText }; }); })
        .then(function(res){ if(!res.ok) return done(new Error((res.data&& (res.data.message||res.data.error))||res.statusText||'Request failed')); done(null, res.data); })
        .catch(done);
    }
    return fn(simple);
  }

  function formatCurrency(amount, code){
    if (amount==null || isNaN(amount)) return '—';
    var cur=(code||'NGN').toUpperCase();
    try { return new Intl.NumberFormat(undefined,{ style:'currency', currency:cur, maximumFractionDigits:0 }).format(amount); }
    catch(_){ return cur+' '+String(amount); }
  }

  function asDateText(s){ if(!s) return ''; var d=new Date(s); if(isNaN(d.getTime())) return String(s); try{ return d.toLocaleDateString(undefined,{ year:'numeric', month:'short', day:'2-digit' }); }catch(_){ return d.toDateString(); } }

  function showMsg(text, type){
    var cont = document.querySelector('.section#payment .content-page-details'); if(!cont) return;
    var id='payments-msg'; var el=document.getElementById(id);
    if(!el){ el=document.createElement('div'); el.id=id; el.className='msg'; cont.prepend(el); }
    el.textContent = text||''; el.className='msg '+(type||'info'); el.hidden = !text;
  }

  function renderOverview(data){
    var wrap = document.querySelector('#page-overview .pay-cont'); if(!wrap) return;
    var ab = data && data.accountBalance || 0;
    var ts = data && data.totalSpent || 0;
    var pp = data && data.pendingPayments || 0;
    wrap.innerHTML = '';
    function card(title, value){
      var d=el('div','pay-items');
      d.innerHTML = '\n        <p class="dollar"><svg xmlns="http://www.w3.org/2000/svg" width="34" height="44" viewBox="0 0 24 24"><path fill="currentColor" d="M7 15h2c0 1.08 1.37 2 3 2s3-.92 3-2c0-1.1-1.04-1.5-3.24-2.03C9.64 12.44 7 11.78 7 9c0-1.79 1.47-3.31 3.5-3.82V3h3v2.18C15.53 5.69 17 7.21 17 9h-2c0-1.08-1.37-2-3-2s-3 .92-3 2c0 1.1 1.04 1.5 3.24 2.03C14.36 11.56 17 12.22 17 15c0 1.79-1.47 3.31-3.5 3.82V21h-3v-2.18C8.47 18.31 7 16.79 7 15"/></svg></p>\n        <div class="pay-balance">\n          <p>'+title+'</p>\n          <h2>'+value+'</h2>\n        </div>\n      ';
      return d;
    }
    wrap.appendChild(card('Account Balance', formatCurrency(ab)));
    wrap.appendChild(card('Total Spent', formatCurrency(ts)));
    wrap.appendChild(card('Pending Payments', formatCurrency(pp)));
  }

  function renderHistoryRows(container, history){
    // Rebuild header to clear any placeholders or previous rows
    container.innerHTML = '<h2>Payment History</h2>\
      <div class="history-header">\
        <p>Date</p><p>Client</p><p>Project</p><p>Amount</p><p>Status</p>\
      </div>';
    if (!history || !history.length){
      var empty = el('div','payment-tran'); empty.textContent = 'No payment history yet.'; container.appendChild(empty); return;
    }
    history.forEach(function(item){
      var row = el('div','payment-tran');
      var cls = (String(item.status||'').toLowerCase()==='completed')? 'comp' : 'pend';
      row.innerHTML = '\n        <p>'+asDateText(item.date)+'</p>\n        <p>'+(item.client||'')+'</p>\n        <p>'+(item.project||'')+'</p>\n        <p>'+formatCurrency(item.amount)+'</p>\n        <p class="'+cls+'">'+(item.status||'')+'</p>\n      ';
      container.appendChild(row);
    });
  }

  function renderHistoryInBoth(history){
    var overCont = document.querySelector('#page-overview .pay-history-cont');
    var histCont = document.querySelector('#page-history .pay-history-cont');
    if (overCont) renderHistoryRows(overCont, history);
    if (histCont) renderHistoryRows(histCont, history);
  }

  function loadOverview(){
    var wrap = document.querySelector('#page-overview .pay-cont'); if (wrap) wrap.innerHTML = '<p style="padding:10px">Loading overview...</p>';
    ensureApi(function(api){
      api('/workers/payments/overview','GET',null,true,function(err,data){
        if (err){ showMsg(err.message||'Failed to load overview','error'); return; }
        showMsg('', '');
        renderOverview(data);
      });
    });
  }

  function loadHistory(){
    var overCont = document.querySelector('#page-overview .pay-history-cont'); if (overCont) overCont.innerHTML = '<h2>Payment History</h2><div class="history-header"><p>Date</p><p>Client</p><p>Project</p><p>Amount</p><p>Status</p></div><p style="padding:10px">Loading history...</p>';
    var histCont = document.querySelector('#page-history .pay-history-cont'); if (histCont) histCont.innerHTML = '<h2>Payment History</h2><div class="history-header"><p>Date</p><p>Client</p><p>Project</p><p>Amount</p><p>Status</p></div><p style="padding:10px">Loading history...</p>';
    ensureApi(function(api){
      api('/workers/payments/history','GET',null,true,function(err,data){
        if (err){ showMsg(err.message||'Failed to load payment history','error'); return; }
        showMsg('', '');
        var history = (data && (data.history || data.data || [])) || [];
        renderHistoryInBoth(history);
      });
    });
  }

  function wireTabs(){
    var tab = document.getElementById('tab-payments');
    if (tab){ if (tab.checked){ loadOverview(); loadHistory(); } tab.addEventListener('change', function(){ if (tab.checked){ loadOverview(); loadHistory(); } }); }
    var ov = document.getElementById('overview-page'); if (ov){ if (ov.checked){ loadOverview(); } ov.addEventListener('change', function(){ if(ov.checked) loadOverview(); }); }
    var hi = document.getElementById('history-page'); if (hi){ if (hi.checked){ loadHistory(); } hi.addEventListener('change', function(){ if(hi.checked) loadHistory(); }); }
  }

  document.addEventListener('DOMContentLoaded', function(){
    var section = document.querySelector('.section#payment'); if (!section) return;
    wireTabs();
  });
})();
