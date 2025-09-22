// Worker Jobs - simple novice code using prod API
(function(){
  // Small helpers
  function $(sel){ return document.querySelector(sel); }
  function $all(sel){ return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function apiBase(){
    var meta = document.querySelector('meta[name="sl-api-base"]');
    return (meta && meta.content) || 'https://skill-link-gg2c.onrender.com/api';
  }
  function isAuthed(){ try { return typeof getToken === 'function' ? !!getToken() : !!(localStorage.getItem('sl_token')||sessionStorage.getItem('sl_token')); } catch(e){ return false; } }
  function guardAuth(){ if(!isAuthed()){ setMsg('Please sign in first. Redirecting…','error'); setTimeout(function(){ window.location.href = '../Sign-In/index.html'; }, 900); return false; } return true; }
  function setMsg(text,type){ var el = $('#jobs-inline-msg'); if(!el){ el = document.createElement('div'); el.id='jobs-inline-msg'; el.className='msg'; var hdr = $('#job .content-page-details'); if(hdr){ hdr.insertBefore(el, hdr.firstChild); } }
    el.textContent = text||''; el.className = 'msg ' + (type||'info'); el.hidden = !text; }
  function formatDate(s){ try{ if(!s) return ''; return String(s).slice(0,10); }catch(e){ return ''; } }
  function money(n,c){ var cur = c||'NGN'; if(n==null) return ''; return cur+ ' ' + n; }
  function absHostUrl(path){ if(!path) return ''; if(String(path).indexOf('http')===0) return path; var host = apiBase().replace('/api',''); return host + path; }

  // API wrapper (prefers callApi from auth.js)
  function call(path, method, body, auth, cb){
    if (typeof callApi === 'function') return callApi(path, method, body, !!auth, cb);
    var url = apiBase() + path;
    var headers = { 'Content-Type':'application/json' };
    try{ if(auth){ var t = (typeof getToken==='function')?getToken(): (localStorage.getItem('sl_token')||sessionStorage.getItem('sl_token')); if(t) headers['Authorization'] = 'Bearer '+t; } }catch(_){ }
    fetch(url, { method: method||'GET', headers: headers, body: body?JSON.stringify(body):undefined })
      .then(function(res){ if(!res.ok) throw new Error('HTTP '+res.status); return res.json(); })
      .then(function(data){ cb && cb(null, data); })
      .catch(function(err){ cb && cb(err); });
  }

  // Render Invites
  function renderInvites(invites){
    var cont = $('#inv-page .invite-page-cont'); if(!cont) return;
  cont.innerHTML = '';
    if(!invites || !invites.length){ cont.innerHTML = '<p style="padding:10px">No invites yet.</p>'; return; }
    invites.forEach(function(inv){
      var title = (inv.job && inv.job.title) || 'Untitled';
      var empName = (inv.employer && (inv.employer.name || (inv.employer.employer && inv.employer.employer.companyName))) || 'Employer';
      var msg = inv.message || '';
      var date = formatDate(inv.createdAt);
      var item = document.createElement('div');
      item.className = 'invite-page-item';
      item.innerHTML = ''+
        '<div class="inv-item inv-item1">'+
          '<div class="inv-prof">'+
            '<p class="inv-image inv-image1" style="background-image:url(\''+ absHostUrl('/Images/Worker/Ellipse 15.png') +'\');"></p>'+
            '<p>—</p>'+
          '</div>'+
          '<div class="inv-head">'+
            '<h2>'+ title +'</h2>'+
            '<div class="inv-name">'+
              '<h4>'+ empName +'</h4>'+
              (msg? '<p>'+ msg +'</p>' : '')+
            '</div>'+
          '</div>'+
        '</div>'+
        '<div class="inv-item inv-item2">'+
          (date? '<p>'+ date +'</p>':'')+
          '<div class="job-but-cont">'+
            '<button class="j-but j-but1" data-act="accept" data-id="'+(inv._id||'')+'">Accept</button>'+
            '<button class="j-but j-but2" data-act="decline" data-id="'+(inv._id||'')+'">Decline</button>'+
          '</div>'+
        '</div>';
      cont.appendChild(item);
    });
    // Wire buttons
    $all('#inv-page .j-but').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = this.getAttribute('data-id');
        var act = this.getAttribute('data-act');
        if(!id) return;
        var path = '/invites/'+id+'/'+(act==='accept'?'accept':'decline');
        this.disabled = true;
        call(path, 'POST', null, true, function(err){
          btn.disabled = false;
          if(err){ setMsg((err && err.message)||'Failed to '+act+' invite','error'); return; }
          setMsg('Invite '+(act==='accept'?'accepted':'declined')+' successfully','success');
          loadInvites();
        });
      });
    });
  }

  function loadInvites(){ if(!guardAuth()) return; setMsg('Loading invites…','info');
    showInviteSkeleton();
    call('/invites', 'GET', null, true, function(err, data){
      if(err){ setMsg((err && err.message)||'Failed to load invites','error'); return; }
      setMsg('', '');
      var list = (data && (data.invites||data.items||data.data)) || [];
      renderInvites(list);
    });
  }

  function showInviteSkeleton(){
    var cont = $('#inv-page .invite-page-cont'); if(!cont) return;
    cont.innerHTML = '';
    for (var i=0;i<3;i++){
      var row = document.createElement('div');
      row.className = 'skeleton-row skeleton';
      row.innerHTML = '<div class="skeleton-avatar"></div>'+
        '<div class="skeleton-lines">'+
        '<div class="skeleton-line long"></div>'+
        '<div class="skeleton-line medium"></div>'+
        '<div class="skeleton-line short"></div>'+
        '</div>';
      cont.appendChild(row);
    }
  }

  // Active Jobs
  function renderActiveJobs(items){
    var cont = $('#act-page .active-page-cont'); if(!cont) return; cont.innerHTML = '';
    if(!items || !items.length){ cont.innerHTML = '<p style="padding:10px">No active jobs.</p>'; return; }
    items.forEach(function(j){
      var title = j.title || (j.job && j.job.title) || 'Untitled';
      var employer = (j.createdBy && (j.createdBy.name || (j.createdBy.employer && j.createdBy.employer.companyName))) || (j.job && j.job.employer && (j.job.employer.name || (j.job.employer.employer && j.job.employer.employer.companyName))) || 'Employer';
      var price = (j.budget!=null? money(j.budget, j.currency) : (j.job && j.job.budgetRange ? ('NGN '+j.job.budgetRange.min+' - '+'NGN '+j.job.budgetRange.max) : ''));
      var when = j.timeline || (j.job && j.job.timeline) || j.category;
      var prog = j.progress!=null? j.progress : 0;
      var item = document.createElement('div'); item.className='active-page-item';
      item.innerHTML = ''+
        '<div class="act-item act-item1">'+
          '<div class="act-prof">'+
            '<p class="act-image act-image1"></p>'+
            '<p>'+ (prog||0) +'%</p>'+
          '</div>'+
          '<div class="act-head">'+
            '<h2>'+ title +' <span class="per">'+(prog||0)+'%</span></h2>'+
            '<div class="act-name">'+
              '<h4>'+ employer +'</h4>'+
              '<p>'+(j.requiredSkills && j.requiredSkills[0] ? j.requiredSkills[0] : (j.job && j.job.requiredSkills && j.job.requiredSkills[0] || ''))+'</p>'+
            '</div>'+
            '<progress min="0" max="100" value="'+(prog||0)+'"></progress>'+
          '</div>'+
        '</div>'+
        '<div class="act-item act-item2">'+
          (price? '<h3>Agreed Price: <span class="price">'+ price +'</span></h3>':'')+
          (when? '<p>'+ formatDate(when) +'</p>':'')+
        '</div>';
      cont.appendChild(item);
    });
  }
  function loadActiveJobs(){ if(!guardAuth()) return; setMsg('Loading active jobs…','info');
    showActiveSkeleton();
    call('/workers/jobs/active', 'GET', null, true, function(err, data){
      if(err){ setMsg((err && err.message)||'Failed to load active jobs','error'); return; }
      setMsg('', '');
      var list = (data && (data.activeJobs||data.items||data.data)) || [];
      renderActiveJobs(list);
    });
  }

  function showActiveSkeleton(){
    var cont = $('#act-page .active-page-cont'); if(!cont) return;
    cont.innerHTML = '';
    for (var i=0;i<3;i++){
      var row = document.createElement('div');
      row.className = 'skeleton-row skeleton';
      row.innerHTML = '<div class="skeleton-avatar"></div>'+
        '<div class="skeleton-lines">'+
        '<div class="skeleton-line long"></div>'+
        '<div class="skeleton-line medium"></div>'+
        '<div class="skeleton-line short"></div>'+
        '</div>';
      cont.appendChild(row);
    }
  }

  // Completed Jobs
  function renderCompletedJobs(items){
    var cont = $('#com-page .complete-page-cont'); if(!cont) return; cont.innerHTML = '';
    if(!items || !items.length){ cont.innerHTML = '<p style="padding:10px">No completed jobs.</p>'; return; }
    items.forEach(function(j){
      var title = j.title || (j.job && j.job.title) || 'Untitled';
      var employer = (j.createdBy && (j.createdBy.name || (j.createdBy.employer && j.createdBy.employer.companyName))) || 'Employer';
      var payment = (j.budget!=null? money(j.budget, j.currency) : '');
      var when = j.timeline || j.category || (j.updatedAt||j.createdAt);
      var item = document.createElement('div'); item.className='complete-page-item';
      item.innerHTML = ''+
        '<div class="com-item com-item1">'+
          '<div class="com-prof"><p class="com-image com-image1"></p></div>'+
          '<div class="com-head">'+
            '<h2>'+ title +' <span class="per">100%</span></h2>'+
            '<div class="com-name">'+
              '<h4>'+ employer +'</h4>'+
              '<p>'+ (j.requiredSkills && j.requiredSkills[0] ? j.requiredSkills[0] : '') +'</p>'+
            '</div>'+
            '<progress min="100" max="100" value="100"></progress>'+
          '</div>'+
        '</div>'+
        '<div class="com-item com-item2">'+
          (payment? '<h3>Payment: <span class="price">'+ payment +'</span></h3>':'')+
          (when? '<p>'+ formatDate(when) +'</p>':'')+
          '<div class="com-but-cont"><button class="c-but">Completed</button></div>'+
        '</div>';
      cont.appendChild(item);
    });
  }
  function loadCompletedJobs(){ if(!guardAuth()) return; setMsg('Loading completed jobs…','info');
    showCompletedSkeleton();
    call('/workers/jobs/completed', 'GET', null, true, function(err, data){
      if(err){ setMsg((err && err.message)||'Failed to load completed jobs','error'); return; }
      setMsg('', '');
      var list = (data && (data.completedJobs||data.items||data.data)) || [];
      renderCompletedJobs(list);
    });
  }

  function showCompletedSkeleton(){
    var cont = $('#com-page .complete-page-cont'); if(!cont) return;
    cont.innerHTML = '';
    for (var i=0;i<3;i++){
      var row = document.createElement('div');
      row.className = 'skeleton-row skeleton';
      row.innerHTML = '<div class="skeleton-avatar"></div>'+
        '<div class="skeleton-lines">'+
        '<div class="skeleton-line long"></div>'+
        '<div class="skeleton-line medium"></div>'+
        '<div class="skeleton-line short"></div>'+
        '</div>';
      cont.appendChild(row);
    }
  }

  // Wire tab changes
  function wireTabs(){
    var inv = document.getElementById('job-invitation');
    var act = document.getElementById('active-job');
    var com = document.getElementById('complete-job');
    if(inv){ inv.addEventListener('change', function(){ if(inv.checked) loadInvites(); }); if(inv.checked) loadInvites(); }
    if(act){ act.addEventListener('change', function(){ if(act.checked) loadActiveJobs(); }); }
    if(com){ com.addEventListener('change', function(){ if(com.checked) loadCompletedJobs(); }); }
  }

  document.addEventListener('DOMContentLoaded', function(){ wireTabs(); });
})();
