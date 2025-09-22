// Populate header user name and avatar across Worker pages
(function(){
  function $all(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function $(sel, root){ return (root||document).querySelector(sel); }
  function setBg(el, url){ if(!el || !url) return; el.style.backgroundImage = "url('"+url+"')"; el.style.backgroundSize='cover'; el.style.backgroundPosition='center'; }
  function displayName(me){
    if (!me) return '';
    if (me.firstname || me.lastname) return [me.firstname||'', me.lastname||''].join(' ').trim();
    return me.name || me.username || me.email || '';
  }
  function resolveImage(url, pid){ try { if (window.SLMedia && SLMedia.resolveUrl) return SLMedia.resolveUrl(url||'', pid||''); } catch(_){} return url||''; }

  // Prefer global callApi; fallback
  function ensureApi(fn){
    if (typeof callApi === 'function') return fn(callApi);
    var base = (typeof API_BASE !== 'undefined' && API_BASE) || (function(){ var m=document.querySelector('meta[name="sl-api-base"]'); return (m&&m.content)||''; })();
    function simple(path, method, body, useAuth, done){
      var headers = { 'Accept':'application/json','Content-Type':'application/json' };
      if (useAuth && typeof getToken === 'function'){ var t = getToken(); if (t) headers['Authorization']='Bearer '+t; }
      fetch(base + path, { method: method||'GET', headers: headers, body: body? JSON.stringify(body): undefined })
        .then(function(r){ var ct=r.headers.get('content-type')||''; var p = ct.indexOf('application/json')!==-1 ? r.json() : r.text().then(function(t){return { message:t };}); return p.then(function(j){ return { ok:r.ok, data:j, statusText:r.statusText }; }); })
        .then(function(out){ if(!out.ok) return done(new Error((out.data&&(out.data.message||out.data.error))||out.statusText||'Request failed')); done(null, out.data); })
        .catch(done);
    }
    return fn(simple);
  }

  function updateUI(me){
    var name = displayName(me);
    // account names
    $all('.account-name').forEach(function(n){ n.textContent = name; });
    // small avatar bubbles used in headers
    var url = '';
    var pid = '';
    try { url = me && me.skilledWorker && me.skilledWorker.profileImage; pid = me && me.skilledWorker && me.skilledWorker.cloudinaryId; } catch(_){ }
    if (!url) { try { url = me.profileImage || me.avatar || me.avatarUrl || me.photo; pid = me.cloudinaryId || pid; } catch(_){ } }
    url = resolveImage(url, pid);
    $all('.profile-image').forEach(function(p){ setBg(p, url); p.style.cursor='pointer'; });
    $all('.dash-prof-image').forEach(function(p){ setBg(p, url); });

    setupAvatarClick(me);
    setupNotifications();
  }

  function setupAvatarClick(me){
    // Clicking avatar/name should open profile page/section
    var isWorker = (me && (me.accountType || me.role)) === 'skilled_worker';
    function goProfile(){
      // If on Worker dashboard with a Profile tab, switch to it
      var profileRadio = document.getElementById('tab-profile');
      if (profileRadio) { profileRadio.checked = true; return; }
      // Else navigate to onboarding profile page based on role
      var href = isWorker ? '../Professional-onboarding/profile.html' : '../Client-onboarding/profile.html';
      try { window.location.href = href; } catch(_){ }
    }
    $all('.account-info .profile-image, .account-info .account-name').forEach(function(el){ el.style.cursor='pointer'; el.addEventListener('click', goProfile); });
  }

  // Notifications panel and logic
  function buildNotifPanel(){
    if (document.getElementById('sl-notify-panel')) return document.getElementById('sl-notify-panel');
    var overlay = document.createElement('div'); overlay.id='sl-notify-overlay'; overlay.style.position='fixed'; overlay.style.inset='0'; overlay.style.background='transparent'; overlay.style.zIndex='9998'; overlay.style.display='none';
    var panel = document.createElement('div'); panel.id='sl-notify-panel'; panel.style.position='fixed'; panel.style.right='18px'; panel.style.top='68px'; panel.style.width='min(420px, 94vw)'; panel.style.maxHeight='60vh'; panel.style.overflow='auto'; panel.style.background='#fff'; panel.style.border='1px solid #e5e7eb'; panel.style.borderRadius='12px'; panel.style.boxShadow='0 10px 30px rgba(0,0,0,0.15)'; panel.style.zIndex='9999'; panel.style.display='none';
    var list = document.createElement('div'); list.id='sl-notify-list'; list.style.display='grid'; list.style.gap='0'; panel.appendChild(list);
    document.body.appendChild(overlay); document.body.appendChild(panel);
    overlay.addEventListener('click', function(){ overlay.style.display='none'; panel.style.display='none'; });
    return panel;
  }

  function renderNotifications(items){
    var panel = buildNotifPanel(); var list = document.getElementById('sl-notify-list');
    list.innerHTML = '';
    if (!items || !items.length){
      var empty = document.createElement('div'); empty.style.padding='12px 14px'; empty.style.color='#64748b'; empty.textContent='No notifications yet.'; list.appendChild(empty); return;
    }
    items.forEach(function(n){
      var row = document.createElement('div'); row.style.padding='10px 12px'; row.style.borderBottom='1px solid #f3f4f6'; row.style.cursor='pointer';
      var title = document.createElement('div'); title.style.fontWeight='600'; title.style.fontSize='14px'; title.style.color='#0f1c2f'; title.textContent = n.title || 'Notification';
      var msg = document.createElement('div'); msg.style.fontSize='13px'; msg.style.color='#111827'; msg.style.marginTop='4px'; msg.style.whiteSpace='pre-wrap'; msg.style.overflowWrap='anywhere'; msg.textContent = n.message || '';
      var meta = document.createElement('div'); meta.style.fontSize='11px'; meta.style.color='#6b7280'; meta.style.marginTop='6px';
      try { var d = n.createdAt ? new Date(n.createdAt) : null; meta.textContent = d ? d.toLocaleString() : ''; } catch(_){ }
      if (n.isRead === false){ row.style.background='#f8fafc'; }
      row.appendChild(title); row.appendChild(msg); row.appendChild(meta);
      row.addEventListener('click', function(){ onOpenNotification(n); });
      list.appendChild(row);
    });
  }

  function onOpenNotification(n){
    // Mark as read then route
    ensureApi(function(api){
      var id = n._id || n.id; if (!id) return routeFromNotification(n);
      api('/notifications/' + encodeURIComponent(id) + '/read', 'PATCH', null, true, function(){ routeFromNotification(n); updateBellDot(); });
    });
  }

  function routeFromNotification(n){
    var link = n && n.link; if (!link){ closeNotifPanel(); return; }
    // Try to handle in-place for common app routes
    if (/\/app\/projects/i.test(link)){
      var tab = document.getElementById('tab-projects'); if (tab){ tab.checked = true; closeNotifPanel(); return; }
    }
    if (/\/app\/invites/i.test(link)){
      var jobTab = document.getElementById('tab-job'); var inv = document.getElementById('job-invitation'); if (jobTab){ jobTab.checked = true; if (inv) inv.checked = true; closeNotifPanel(); return; }
    }
    // Fallback: if absolute URL or app-relative path, navigate
    try { if (/^https?:\/\//i.test(link) || /^\//.test(link)) { window.location.href = link; return; } } catch(_){ }
    closeNotifPanel();
  }

  function closeNotifPanel(){ var overlay = document.getElementById('sl-notify-overlay'); var panel = document.getElementById('sl-notify-panel'); if (overlay) overlay.style.display='none'; if (panel) panel.style.display='none'; }
  function openNotifPanel(){ var overlay = document.getElementById('sl-notify-overlay'); var panel = buildNotifPanel(); if (overlay) overlay.style.display='block'; panel.style.display='block'; }

  function updateBellDot(){
    ensureApi(function(api){
      api('/notifications','GET',null,true,function(err,data){
        var list = (data && (data.notifications || data.data || [])) || [];
        var unread = list.filter(function(n){
          // handle various backends: isRead false, read false, or missing flag treated as read
          if (typeof n.isRead !== 'undefined') return n.isRead === false;
          if (typeof n.read !== 'undefined') return n.read === false;
          return false;
        }).length;
        $all('.noti .noti-dot').forEach(function(dot){ dot.style.visibility = unread ? 'visible' : 'hidden'; dot.title = unread ? (unread + ' unread') : ''; });
        // Update the dropdown if open
        if (document.getElementById('sl-notify-panel') && document.getElementById('sl-notify-panel').style.display !== 'none'){
          renderNotifications(list);
        }
      });
    });
  }

  function setupNotifications(){
    // Toggle panel on bell click; fetch list
    $all('.noti .noti-bell').forEach(function(bell){
      bell.style.cursor='pointer';
      bell.addEventListener('click', function(){
        ensureApi(function(api){ api('/notifications','GET',null,true,function(err,data){ var list = (data && (data.notifications || data.data || [])) || []; renderNotifications(list); openNotifPanel(); }); });
      });
    });
    // Initial dot update
    updateBellDot();
    // Optional: refresh every 60s
    try { setInterval(updateBellDot, 60000); } catch(_){ }
  }

  function init(){
    if (typeof getMe !== 'function') return; // auth.js not loaded yet
    getMe(function(err, me){ if(err||!me) return; updateUI(me); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
