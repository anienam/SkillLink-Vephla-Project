// Projects page client logic: loads the list and single project details
(function () {
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // Simple modal helper: reuses Worker page modal if available, else prompt fallback
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
      var v = window.prompt((opts && (opts.title + ': ' + (opts.label||''))) || 'Enter value');
      return done && done(v);
    }
    title.textContent = (opts && opts.title) || 'Input';
    label.textContent = (opts && opts.label) || 'Value';
    input.type = (opts && opts.type) || 'text';
    input.value = (opts && opts.value) || '';
    input.placeholder = (opts && opts.placeholder) || '';
    ok.textContent = (opts && opts.okText) || 'OK';
    function hide(){ backdrop.style.display='none'; modal.style.display='none'; ok.onclick=null; cancel.onclick=null; close.onclick=null; document.onkeydown=null; }
    function submit(){ var v = input.value; hide(); if (done) done(v); }
    backdrop.style.display='block'; modal.style.display='block';
    setTimeout(function(){ try{ input.focus(); input.select && input.select(); }catch(_){ } }, 0);
    ok.onclick = submit;
    cancel.onclick = function(){ hide(); if(done) done(null); };
    close.onclick = function(){ hide(); if(done) done(null); };
    document.onkeydown = function(e){ if(e.key==='Escape'){ hide(); if(done) done(null);} if(e.key==='Enter'){ submit(); } };
  }

  function showProjectsMsg(text, type) {
    var cont = $('.section#project .content-page-details .project-cont');
    if (!cont) return;
    var id = 'projects-msg';
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'msg';
      cont.prepend(el);
    }
    // Sanitize noisy backend errors so we don't show stack traces
    function sanitizeErrorMessage(raw){
      var s = String(raw || '');
      var lower = s.toLowerCase();
      if (/cast(error| to date)/i.test(s)) return 'Invalid date. Please pick a valid date.';
      if (/validationerror/i.test(s)) return 'Some fields are invalid. Please check and try again.';
      if (/networkerror|failed to fetch/i.test(lower)) return 'Network error. Please check your connection and try again.';
      if (/(unauthorized|forbidden|401|403)/i.test(s)) return 'Your session may have expired. Please sign in again.';
      if (/timeout|timed out/i.test(lower)) return 'Request timed out. Please try again.';
      if (s.length > 180 || /\n\s*at\s/.test(s)) return 'Something went wrong. Please try again.';
      return s;
    }
    var display = (type === 'error') ? sanitizeErrorMessage(text) : (text || '');
    if ((type === 'error') && display !== text && text){ try { console.error('[projects]', text); } catch(_){} }
    el.textContent = display;
    el.className = 'msg ' + (type || 'info');
    el.hidden = !text;
  }

  function ensureApi(fn) {
    // Prefer global callApi from auth.js
    if (typeof callApi === 'function') return fn(callApi);
    // Fallback lightweight fetcher if auth.js wasn't loaded for some reason
    var base = (typeof API_BASE !== 'undefined' && API_BASE) || (function () {
      var meta = document.querySelector('meta[name="sl-api-base"]');
      return (meta && meta.content) || '';
    })();
    function simple(path, method, body, useAuth, done) {
      var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
      if (useAuth && typeof getToken === 'function') {
        var t = getToken();
        if (t) headers['Authorization'] = 'Bearer ' + t;
      }
      fetch(base + path, { method: method || 'GET', headers: headers, body: body ? JSON.stringify(body) : undefined })
        .then(function (r) { return r.json().catch(function(){ return {}; }).then(function (j) { return { ok: r.ok, data: j, statusText: r.statusText }; }); })
        .then(function (res) { if (!res.ok) return done(new Error((res.data && (res.data.message || res.data.error)) || res.statusText || 'Request failed')); done(null, res.data); })
        .catch(done);
    }
    return fn(simple);
  }

  function formatCurrency(amount, currency) {
    if (amount == null || isNaN(amount)) return '';
    var code = (currency || 'NGN').toUpperCase();
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: code, maximumFractionDigits: 0 }).format(amount);
    } catch (e) {
      return (code + ' ' + String(amount));
    }
  }

  function asDateText(s) {
    if (!s) return '';
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    try { return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' }); } catch (e) { return d.toDateString(); }
  }

  // Simple ISO date (YYYY-MM-DD) validator used before calling APIs
  function isValidISODate(s){
    if (!s || typeof s !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var t = Date.parse(s + 'T00:00:00Z');
    return !isNaN(t);
  }

  function renderList(container, projects, selectedId) {
    var list = document.createElement('div');
    list.className = 'project-list';
    if (!projects || !projects.length) {
      list.innerHTML = '<p>No projects yet.</p>';
      container.appendChild(list);
      return list;
    }
    projects.forEach(function (p) {
      var item = document.createElement('div');
      item.className = 'project-item-row' + (selectedId && selectedId === p._id ? ' selected' : '');
      var creator = (p.createdBy && (p.createdBy.name || (p.createdBy.employer && p.createdBy.employer.companyName))) || '';
      var assignee = (p.assignedTo && p.assignedTo.name) || '';
      var budget = (p.budget != null) ? formatCurrency(p.budget, p.currency || 'NGN') : '';
      var when = p.deadline || p.dueDate || p.category || p.createdAt; // attempt to find a date-like field
      item.innerHTML = (
        '<div class="row-main">' +
          '<h3>' + (p.title || 'Untitled Project') + '</h3>' +
          '<div class="meta">' +
            (creator ? ('<span class="creator">By ' + creator + '</span>') : '') +
            (assignee ? ('<span class="assignee"> • Assigned to ' + assignee + '</span>') : '') +
          '</div>' +
        '</div>' +
        '<div class="row-side">' +
          (budget ? ('<span class="budget">' + budget + '</span>') : '') +
          (when ? ('<span class="deadline">' + asDateText(when) + '</span>') : '') +
        '</div>'
      );
      item.addEventListener('click', function(){ selectProject(p._id); });
      list.appendChild(item);
    });
    container.appendChild(list);
    return list;
  }

  function renderDetails(container, p) {
    var wrap = document.createElement('div');
    wrap.className = 'project-details';
    if (!p) {
      wrap.innerHTML = '<p>Select a project to view details.</p>';
      container.appendChild(wrap);
      return wrap;
    }
    var progress = (typeof p.progress === 'number') ? Math.max(0, Math.min(100, p.progress)) : 0;
    var assigneeRole = (p.assignedTo && p.assignedTo.accountType) || '';
    var assigneeName = (p.assignedTo && p.assignedTo.name) || '';
    var when = p.deadline || p.dueDate || p.category || p.createdAt;
  var statusText = p.status || '';

    // Use existing styling blocks where possible
    wrap.innerHTML = '' +
      '<div class="project-job">' +
        '<div class="project-job-header">' +
          '<h2>' + (p.title || 'Untitled') + '</h2>' +
          '<div class="project-split">' +
            '<p>Project Overview</p>' +
            '<div class="project-profile">' +
              '<p class="project-image"></p>' +
              '<div class="project-info">' +
                '<h2>' + (assigneeName || 'Unassigned') + '</h2>' +
                '<p>' + (assigneeRole || '') + '</p>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="mang-budget-cont">' +
            '<div class="budget-cont">' +
              '<p>Budget</p>' +
              '<h4>' + ((p.budget != null) ? formatCurrency(p.budget, p.currency || 'NGN') : '—') + '</h4>' +
            '</div>' +
            '<div class="deadline-cont">' +
              '<p>Deadline</p>' +
              '<h4>' + (when ? asDateText(when) : '—') + '</h4>' +
            '</div>' +
          '</div>' +
          '<div class="project-progress">' +
            '<progress min="0" max="100" value="' + progress + '"></progress>' +
            '<p style="margin:6px 0 0 0;font-size:12px;color:#555">Status: <strong>' + (statusText || '—') + '</strong></p>' +
          '</div>' +
        '</div>' +
        '<div class="project-job-body">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
            '<h2 style="margin:0">Milestones</h2>' +
            '<button class="p-but1" id="btn-add-milestone" style="display:none">Add Milestone</button>' +
          '</div>' +
          '<div class="mile-cont" id="milestones-list"></div>' +
        '</div>' +
        '<div class="project-job-footer">' +
          '<div class="project-footer-left">' +
            '<h2>Work Submission</h2>' +
            '<div class="project-upload" id="submissions-list"></div>' +
            '<div class="submission-form" id="submission-form" style="display:none; gap:8px; align-items:center; flex-wrap:wrap; margin-top:8px">' +
              '<select id="submission-milestone" style="padding:8px;border:1px solid #cbd5e1;border-radius:6px;min-width:180px">' +
                '<option value="">Choose milestone (optional)</option>' +
              '</select>' +
              '<input type="file" id="submission-file" style="padding:6px 8px;border:1px solid #cbd5e1;border-radius:6px;background:#fff" />' +
              '<input type="text" id="submission-note" placeholder="Note (optional)" style="flex:1;min-width:160px;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px" />' +
              '<button class="p-but1" id="btn-submit-work">Upload & Submit</button>' +
            '</div>' +
            '<div class="project-foot-cont">' +
              '<button class="p-but1" id="btn-request-payment">Request Payment</button>' +
              '<button class="p-but1" id="btn-request-extension" disabled>Extend Deadline</button>' +
              '<button class="p-but1" disabled>Report Issue</button>' +
              (statusText !== 'completed' ? ('<button class="p-but1" id="btn-mark-completed">Mark Completed</button>') : '') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    // Milestones
    var msList = wrap.querySelector('#milestones-list');
    var ms = Array.isArray(p.milestones) ? p.milestones : [];
    if (!ms.length) {
      msList.innerHTML = '<p>No milestones yet.</p>';
    } else {
      ms.forEach(function (m) {
        var item = document.createElement('div');
        item.className = 'mile-item';
        var btnsHtml = '';
        var role = (state.me && (state.me.accountType || state.me.role)) || '';
        // Employer/Client: can approve only when submitted
        if ((role === 'employer' || role === 'client') && m.status === 'submitted') {
          btnsHtml += '<button class="p-but1" data-action="approve" data-mid="' + (m._id || '') + '">Approve</button>';
        }
        // Worker: can start or submit
        if ((role === 'skilled_worker' || role === 'worker')) {
          if (m.status !== 'approved' && m.status !== 'submitted' && m.status !== 'in_progress') {
            btnsHtml += '<button class="p-but1" data-action="start" data-mid="' + (m._id || '') + '">Start</button>';
          }
          if (m.status === 'in_progress') {
            btnsHtml += '<button class="p-but1" data-action="submit" data-mid="' + (m._id || '') + '">Submit</button>';
          }
        }
        item.innerHTML = '' +
          '<div class="mile-info">' +
            '<h3>' + (m.title || 'Milestone') + '</h3>' +
            '<p>' + (m.description || '') + '</p>' +
          '</div>' +
          '<div class="mile-detail-cont">' +
            '<div class="mile-deadline">' +
              '<h3>Deadline</h3>' +
              '<p>' + (m.deadline ? asDateText(m.deadline) : '—') + '</p>' +
            '</div>' +
            '<div class="mile-button-cont">' +
              '<p class="mm-but1">' + (m.status || 'pending') + '</p>' +
              btnsHtml +
            '</div>' +
          '</div>';
        msList.appendChild(item);
      });
    }

    // Submissions
    var subList = wrap.querySelector('#submissions-list');
    var subs = Array.isArray(p.submissions) ? p.submissions : [];
    if (!subs.length) {
      subList.innerHTML = '<div class="project-file">No submissions yet.</div>';
    } else {
      subs.forEach(function (s) {
        var name = s.filename || s.name || 'attachment';
        var url = s.url || s.fileUrl || s.absoluteUrl || '';
        try { if (window.SLMedia && SLMedia.resolveUrl) url = SLMedia.resolveUrl(url, s.cloudinaryId); } catch(_){}
        var el = document.createElement('div');
        el.className = 'project-file';
        if (url){
          var a = document.createElement('a'); a.textContent = '🔗 ' + name; a.href = url; a.target = '_blank'; a.rel='noopener';
          el.appendChild(a);
        } else {
          el.textContent = '🔗 ' + name;
        }
        subList.appendChild(el);
      });
    }

    // Messages panel removed from main details; see right-hand sidebar for messages

    container.appendChild(wrap);

    // Profile image thumbnail (assigned worker)
    try {
      var imgEl = wrap.querySelector('.project-image');
      var imgSrc = (p.assignedTo && (p.assignedTo.avatar || p.assignedTo.image || p.assignedTo.photo || p.assignedTo.profileImage || (p.assignedTo.skilledWorker && p.assignedTo.skilledWorker.profileImage))) || '';
      if (imgEl && imgSrc){
        var abs = imgSrc;
        try { if (window.SLMedia && SLMedia.resolveUrl) abs = SLMedia.resolveUrl(imgSrc); } catch(_){ }
        if (window.SLMedia && SLMedia.setBgIfLoaded){
          SLMedia.setBgIfLoaded(imgEl, abs);
        } else if (/^https?:\/\//i.test(abs)) {
          var im = new Image(); im.onload = function(){ imgEl.style.backgroundImage = "url('"+abs+"')"; imgEl.style.backgroundSize='cover'; imgEl.style.backgroundPosition='center'; }; im.src = abs;
        }
      }
    } catch(_){ }

    // Wire up action buttons after DOM nodes exist
    var markBtn = wrap.querySelector('#btn-mark-completed');
    if (markBtn) {
      markBtn.addEventListener('click', function(){
        updateProjectStatus(p._id, 'completed', markBtn);
      });
    }

    var reqBtn = wrap.querySelector('#btn-request-payment');
    if (reqBtn) {
      reqBtn.addEventListener('click', function(){
        askModal({ title:'Request Payment', label:'Amount', type:'number', placeholder:'e.g. 25000', okText:'Request' }, function(v){
          if (v == null) return; var n = parseFloat(v); if (isNaN(n) || n <= 0) { showProjectsMsg('Enter a valid amount', 'error'); return; }
          requestPayment(p._id, n, reqBtn);
        });
      });
    }

    // Wire milestone action buttons (approve/start/submit/request-extension)
    var actionBtns = wrap.querySelectorAll('.mile-button-cont button[data-mid]');
    Array.prototype.forEach.call(actionBtns, function(btn){
      btn.addEventListener('click', function(){
        var mid = btn.getAttribute('data-mid');
        var action = btn.getAttribute('data-action');
        if (action === 'approve') { approveMilestone(p._id, mid, btn); return; }
        if (action === 'start') { setMilestoneStatus(p._id, mid, 'in_progress', btn); return; }
        if (action === 'submit') { submitMilestone(p._id, mid, btn); return; }
        if (action === 'request-ext') {
          // Ask for new deadline (date picker) and an optional reason using modals
          askModal({ title: 'Request Extension', label: 'New deadline', type: 'date', placeholder: '', okText: 'Next' }, function(dateVal){
            if (dateVal == null) return; var nd = String(dateVal).trim();
            if (!isValidISODate(nd)) { showProjectsMsg('Please pick a valid date (YYYY-MM-DD).', 'error'); return; }
            askModal({ title: 'Request Extension', label: 'Reason (optional)', placeholder: 'Why do you need more time?', okText: 'Send' }, function(reason){
              sendExtensionRequest(p._id, mid, nd, reason || '', function(err){
                if (err) { showProjectsMsg(err.message || 'Failed to send extension request','error'); return; }
                showProjectsMsg('Extension request sent.','success');
                selectProject(p._id);
              });
            });
          });
          return;
        }
      });
    });

    // Add Milestone button for employers/clients
    var addBtn = wrap.querySelector('#btn-add-milestone');
    if (addBtn) {
      var role = (state.me && (state.me.accountType || state.me.role)) || '';
      if (role === 'employer' || role === 'client') {
        addBtn.style.display = '';
        addBtn.addEventListener('click', function(){
          // Collect simple fields via prompt modal
          askModal({ title: 'New Milestone', label: 'Title', placeholder: 'e.g. Foundation', okText: 'Next' }, function(title){
            if (title == null || String(title).trim() === '') return;
            askModal({ title: 'New Milestone', label: 'Description', placeholder: 'Short description', okText: 'Next' }, function(desc){
              if (desc == null) desc = '';
              askModal({ title: 'New Milestone', label: 'Deadline', type: 'date', okText: 'Add' }, function(dl){
                if (dl == null) return; var v = String(dl).trim();
                if (!isValidISODate(v)) { showProjectsMsg('Please pick a valid date (YYYY-MM-DD).', 'error'); return; }
                var newMs = (Array.isArray(p.milestones) ? p.milestones.slice() : []);
                newMs.push({ title: String(title).trim(), description: String(desc).trim(), deadline: v, status: 'in_progress' });
                updateProjectMilestones(p._id, newMs, addBtn);
              });
            });
          });
        });
      } else {
        addBtn.style.display = 'none';
      }
    }

    // Worker submission form: only for workers
    var subForm = wrap.querySelector('#submission-form');
    if (subForm){
      var meRole = (state.me && (state.me.accountType || state.me.role)) || '';
      if (meRole === 'skilled_worker' || meRole === 'worker'){
        subForm.style.display = 'flex';
        // Fill milestone picker
        var sel = subForm.querySelector('#submission-milestone');
        var list = Array.isArray(p.milestones) ? p.milestones : [];
        list.forEach(function(m){
          var opt = document.createElement('option');
          opt.value = m._id || '';
          opt.textContent = (m.title || 'Milestone') + (m.status? (' • ' + m.status) : '');
          sel.appendChild(opt);
        });
        var doSubmit = subForm.querySelector('#btn-submit-work');
        doSubmit.addEventListener('click', function(){
          var file = subForm.querySelector('#submission-file').files[0];
          var note = subForm.querySelector('#submission-note').value.trim();
          var mid = sel.value || '';
          if (!file){ showProjectsMsg('Please select a file to upload','error'); return; }
          doSubmit.disabled = true;
          uploadWorkSubmission(p._id, file, note, mid, function(err, result){
            doSubmit.disabled = false;
            if (err){ showProjectsMsg(err.message || 'Failed to submit work','error'); return; }
            showProjectsMsg('Submission uploaded.', 'success');
            // If milestone chosen, also mark as submitted
            if (mid){ submitMilestone(p._id, mid); }
            // Refresh
            selectProject(p._id);
          });
        });
      }
    }

    // Worker: enable project-level extension request button
    try {
      var extBtn = wrap.querySelector('#btn-request-extension');
      var roleX = (state.me && (state.me.accountType || state.me.role)) || '';
      if (extBtn && (roleX === 'skilled_worker' || roleX === 'worker')){
        extBtn.disabled = false; extBtn.textContent = 'Request Extension';
        extBtn.addEventListener('click', function(){
          // If milestones exist, ask which to extend; else fallback to project-level message
          var ms = Array.isArray(p.milestones)? p.milestones : [];
          if (!ms.length){
            askModal({ title:'Request Extension', label:'New deadline', type:'date', okText:'Next' }, function(nd){
              if (nd == null) return; var v = String(nd).trim();
              if (!isValidISODate(v)) { showProjectsMsg('Please pick a valid date (YYYY-MM-DD).', 'error'); return; }
              askModal({ title:'Request Extension', label:'Reason (optional)', placeholder:'Why do you need more time?', okText:'Send' }, function(reason){
                sendExtensionRequest(p._id, '', v, reason||'', function(err){
                  if (err){ showProjectsMsg(err.message || 'Failed to send extension request','error'); return; }
                  showProjectsMsg('Extension request sent.','success');
                  selectProject(p._id);
                });
              });
            });
          } else {
            // Default to the first in-progress milestone if any
            var target = ms.find(function(m){ return m.status === 'in_progress'; }) || ms[0];
            askModal({ title:'Request Extension', label:'New deadline for "'+(target.title||'Milestone')+'"', type:'date', okText:'Next' }, function(nd){
              if (nd == null) return; var v = String(nd).trim();
              if (!isValidISODate(v)) { showProjectsMsg('Please pick a valid date (YYYY-MM-DD).', 'error'); return; }
              askModal({ title:'Request Extension', label:'Reason (optional)', placeholder:'Why do you need more time?', okText:'Send' }, function(reason){
                sendExtensionRequest(p._id, target._id || '', v, reason||'', function(err){
                  if (err){ showProjectsMsg(err.message || 'Failed to send extension request','error'); return; }
                  showProjectsMsg('Extension request sent.','success');
                  selectProject(p._id);
                });
              });
            });
          }
        });
      }
    } catch(_){ }

    // No send button in main details anymore
    return wrap;
  }

  var state = { selectedId: null, projects: [] };
  // Current user info for simple role checks
  state.me = null;

  function ensureMe(cb){
    if (state.me) { if (cb) cb(null, state.me); return; }
    if (typeof getMe === 'function') {
      getMe(function(err, me){ if (!err) state.me = me || null; if (cb) cb(err, state.me); });
    } else { if (cb) cb(null, null); }
  }

  function renderSidebar(container, p){
    var aside = document.createElement('div');
    aside.className = 'aside-card';
    if (!p){ aside.innerHTML = '<p>No project selected.</p>'; container.appendChild(aside); return aside; }
    aside.innerHTML = ''+
      '<div class="project-messages" style="position:sticky; top:10px">' +
        '<h2>Messages</h2>' +
        '<div id="messages-list" style="max-height:420px; overflow-y:auto; overflow-x:hidden; border:1px solid #eee; border-radius:8px; padding:8px; background:#fff; margin-bottom:8px;"></div>' +
        '<div style="display:flex; gap:8px;">' +
          '<input type="text" id="msg-input" placeholder="Type a message" style="flex:1; padding:8px 10px; border:1px solid #cbd5e1; border-radius:6px;">' +
          '<button class="p-but1 spec-but" id="btn-send-msg">Send</button>' +
        '</div>' +
      '</div>';

    // Populate messages
    var msgsCont = aside.querySelector('#messages-list');
    var msgs = (p && (Array.isArray(p.messages)? p.messages : (Array.isArray(p.chatMessages) ? p.chatMessages : []))) || [];
    if (msgsCont){
      if (msgs.length){
        // helpers
        function resolveImg(url){ try { if (window.SLMedia && SLMedia.resolveUrl) return SLMedia.resolveUrl(url||''); } catch(_){} return url||''; }
        function displayName(u){ if(!u) return ''; var n = '';
          if (u.name) n = u.name; else if (u.firstname || u.lastname) n = [(u.firstname||''),(u.lastname||'')].join(' ').trim();
          if (!n) n = (u.employer && u.employer.companyName) || u.username || u.email || '';
          return n; }
        function initialOf(n){ n = (n||'').trim(); return n ? n[0].toUpperCase() : '?'; }
        function applyInitialAvatar(el, name){
          try {
            el.textContent = initialOf(name);
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.style.fontSize = '12px';
            el.style.fontWeight = '700';
            el.style.color = '#0f1c2f';
            el.style.background = '#e5e7eb';
          } catch(e){}
        }
        msgs.forEach(function(m){
      
          var row = document.createElement('div');
          row.style.padding = '8px 8px';
          row.style.borderBottom = '1px solid #f3f4f6';
          var sender = m.sender || m.user || m.from || {};
          var myId = state.me && (state.me._id || state.me.id);
          var sid = sender._id || sender.id;
          var isMe = myId && sid && String(myId) === String(sid);
          var whoName = displayName(sender) || m.senderName || m.createdByName || (m.createdBy && m.createdBy.name) || '';
          var who = isMe ? 'You' : (whoName || '');
          var when = m.createdAt ? (new Date(m.createdAt)).toLocaleString() : '';
          var text = m.text || m.content || m.message || '';
          var avatar = sender.avatar || sender.image || sender.photo || sender.profileImage || (sender.skilledWorker && sender.skilledWorker.profileImage) || (sender.employer && (sender.employer.companyLogo || sender.employer.logo)) || m.senderAvatar || m.avatar || '';
          avatar = resolveImg(avatar);
          var special = null;
          // Extension request format: [REQUEST:EXTEND]{json}
          if (/^\[REQUEST:EXTEND\]/.test(text)){
            try { special = { type:'extend', data: JSON.parse(String(text).replace(/^\[REQUEST:EXTEND\]/,'')) }; } catch(e){ special = { type:'extend', data:null }; }
          }
          var bodyHtml = '<div style="font-size:14px;color:#111827;white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word;">' + (text || '') + '</div>';
          if (special && special.type==='extend' && special.data){
            var d = special.data || {}; var dateNice = d.deadline ? asDateText(d.deadline) : '';
            bodyHtml = ''+
              '<div style="font-size:14px; color:#111827">'+
                '<div><strong>Extension Request</strong></div>'+
                (d.milestoneId? ('<div>Milestone: '+(d.milestoneTitle||d.milestoneId)+'</div>') : '')+
                (d.deadline? ('<div>New deadline: <strong>'+dateNice+'</strong></div>') : '')+
                (d.reason? ('<div style="color:#374151; margin-top:4px">Reason: '+d.reason+'</div>') : '')+
              '</div>';
            // Approve/Decline for employer
            var role = (state.me && (state.me.accountType || state.me.role)) || '';
            if (role==='employer' || role==='client'){
              bodyHtml += ''+
                '<div style="margin-top:8px; display:flex; gap:8px">'+
                  '<button class="p-but1" data-approve-ext="1" data-mid="'+(d.milestoneId||'')+'" data-deadline="'+(d.deadline||'')+'">Approve</button>'+
                  '<button class="p-but1" style="background:#eee;color:#111" data-decline-ext="1" data-mid="'+(d.milestoneId||'')+'" data-deadline="'+(d.deadline||'')+'">Decline</button>'+
                '</div>';
            }
          }
          row.innerHTML = ''+
            '<div style="display:flex;gap:10px;align-items:flex-start">'+
              '<div class="msg-avatar" style="width:28px;height:28px;border-radius:50%;background:#e5e7eb;flex:0 0 28px"></div>'+
              '<div class="msg-body" style="flex:1; min-width:0">'+
                '<div style="font-size:12px;color:#64748b;display:flex;gap:6px;flex-wrap:wrap"><strong style="color:#0f1c2f">' + (who || '—') + '</strong><span>' + when + '</span></div>'+
                bodyHtml+
              '</div>'+
            '</div>';
          var avEl = row.querySelector('.msg-avatar');
          if (avEl){
            if (avatar){
              if (window.SLMedia && SLMedia.setBgIfLoaded){
                SLMedia.setBgIfLoaded(avEl, avatar);
              } else if (/^https?:\/\//i.test(avatar)) {
                var img = new Image();
                img.onload = function(){ avEl.style.backgroundImage = "url('"+avatar+"')"; avEl.style.backgroundSize='cover'; avEl.style.backgroundPosition='center'; };
                img.onerror = function(){ applyInitialAvatar(avEl, whoName || who); };
                img.src = avatar;
              } else {
                applyInitialAvatar(avEl, whoName || who);
              }
            } else {
              applyInitialAvatar(avEl, whoName || who);
            }
          }
          msgsCont.appendChild(row);

          // Wire approve/decline if present
          var approveBtn = row.querySelector('button[data-approve-ext]');
          var declineBtn = row.querySelector('button[data-decline-ext]');
          if (approveBtn){
            approveBtn.addEventListener('click', function(){
              var mid = approveBtn.getAttribute('data-mid') || '';
              var nd = approveBtn.getAttribute('data-deadline') || '';
              if (!isValidISODate(nd)) { showProjectsMsg('The requested deadline is invalid. Ask the worker to resend with a valid date.', 'error'); return; }
              patchMilestoneDeadline(p._id, mid, nd, approveBtn, function(err){
                if (err){ showProjectsMsg(err.message || 'Failed to approve extension','error'); return; }
                // Send response message
                sendMessage(p._id, '[RESPONSE:EXTEND]'+JSON.stringify({ milestoneId: mid, deadline: nd, approved: true }), function(){ selectProject(p._id); });
              });
            });
          }
          if (declineBtn){
            declineBtn.addEventListener('click', function(){
              var mid = declineBtn.getAttribute('data-mid') || '';
              var nd = declineBtn.getAttribute('data-deadline') || '';
              sendMessage(p._id, '[RESPONSE:EXTEND]'+JSON.stringify({ milestoneId: mid, deadline: nd, approved: false }), function(){ selectProject(p._id); });
            });
          }
        });
      } else {
        msgsCont.innerHTML = '<div style="color:#64748b;font-size:13px">No messages yet.</div>';
      }
    }

    var sendBtn = aside.querySelector('#btn-send-msg');
    var msgInput = aside.querySelector('#msg-input');
    if (sendBtn && msgInput){
      sendBtn.addEventListener('click', function(){
        var text = (msgInput.value || '').trim();
        if(!text){ showProjectsMsg('Message cannot be empty','error'); return; }
        sendBtn.disabled = true;
        sendMessage(p._id, text, function(err){
          sendBtn.disabled = false;
          if (err){ showProjectsMsg(err.message || 'Failed to send message','error'); return; }
          msgInput.value='';
          selectProject(p._id);
        });
      });
    }
    container.appendChild(aside);
    return aside;
  }

  // Skeletons for initial and detail loading
  function renderSkeletonGrid(){
    var cont = $('.section#project .content-page-details .project-cont');
    if (!cont) return;
    cont.innerHTML = ''+
      '<div class="projects-grid">'+
        '<div class="projects-left">'+
          '<div class="project-list">'+
            '<div class="project-item-row">'+
              '<div class="row-main"><div class="skl-line w-120"></div><div class="skl-line w-180 light"></div></div>'+
              '<div class="row-side"><div class="skl-line w-80"></div><div class="skl-line w-60 light"></div></div>'+
            '</div>'+
            '<div class="project-item-row">'+
              '<div class="row-main"><div class="skl-line w-100"></div><div class="skl-line w-160 light"></div></div>'+
              '<div class="row-side"><div class="skl-line w-70"></div><div class="skl-line w-50 light"></div></div>'+
            '</div>'+
            '<div class="project-item-row">'+
              '<div class="row-main"><div class="skl-line w-140"></div><div class="skl-line w-200 light"></div></div>'+
              '<div class="row-side"><div class="skl-line w-90"></div><div class="skl-line w-70 light"></div></div>'+
            '</div>'+
          '</div>'+
        '</div>'+
        '<div class="projects-right">'+
          '<div class="projects-right-grid">'+
            '<div class="project-main">'+
              '<div class="project-job">'+
                '<div class="project-job-header">'+
                  '<div class="skl-line w-160" style="height:18px"></div>'+
                  '<div class="mang-budget-cont" style="margin-top:12px">'+
                    '<div class="budget-cont"><div class="skl-line w-80"></div><div class="skl-line w-60 light"></div></div>'+
                    '<div class="deadline-cont"><div class="skl-line w-80"></div><div class="skl-line w-60 light"></div></div>'+
                  '</div>'+
                  '<div class="project-progress" style="margin-top:12px">'+
                    '<div class="skl-bar"></div>'+
                  '</div>'+
                '</div>'+
                '<div class="project-job-body">'+
                  '<div class="skl-line w-120" style="height:16px;margin-bottom:8px"></div>'+
                  '<div class="mile-cont">'+
                    '<div class="skl-card"></div>'+
                    '<div class="skl-card"></div>'+
                  '</div>'+
                '</div>'+
              '</div>'+
            '</div>'+
            '<div class="project-aside">'+
              '<div class="aside-card">'+
                '<h2>Messages</h2>'+
                '<div class="skl-msg-list">'+
                  '<div class="skl-msg"></div>'+
                  '<div class="skl-msg"></div>'+
                  '<div class="skl-msg"></div>'+
                '</div>'+
              '</div>'+
            '</div>'+
          '</div>'+
        '</div>'+
      '</div>';
  }

  function renderSkeletonProject(){
    var main = $('.section#project .project-main');
    var aside = $('.section#project .project-aside');
    if (main){
      main.innerHTML = ''+
        '<div class="project-job">'+
          '<div class="project-job-header">'+
            '<div class="skl-line w-160" style="height:18px"></div>'+
            '<div class="mang-budget-cont" style="margin-top:12px">'+
              '<div class="budget-cont"><div class="skl-line w-80"></div><div class="skl-line w-60 light"></div></div>'+
              '<div class="deadline-cont"><div class="skl-line w-80"></div><div class="skl-line w-60 light"></div></div>'+
            '</div>'+
            '<div class="project-progress" style="margin-top:12px"><div class="skl-bar"></div></div>'+
          '</div>'+
          '<div class="project-job-body">'+
            '<div class="skl-line w-120" style="height:16px;margin-bottom:8px"></div>'+
            '<div class="mile-cont"><div class="skl-card"></div><div class="skl-card"></div></div>'+
          '</div>'+
        '</div>';
    }
    if (aside){
      aside.innerHTML = ''+
        '<div class="aside-card">'+
          '<h2>Messages</h2>'+
          '<div class="skl-msg-list">'+
            '<div class="skl-msg"></div>'+
            '<div class="skl-msg"></div>'+
            '<div class="skl-msg"></div>'+
          '</div>'+
        '</div>';
    }
  }

  function layoutAndRender() {
    var cont = $('.section#project .content-page-details .project-cont');
    if (!cont) return;
    // Clear any demo/static markup once we take over
    cont.innerHTML = '';

    var grid = document.createElement('div');
    grid.className = 'projects-grid';

    var left = document.createElement('div'); left.className = 'projects-left';
    var right = document.createElement('div'); right.className = 'projects-right';

    grid.appendChild(left); grid.appendChild(right);
    cont.appendChild(grid);

    renderList(left, state.projects, state.selectedId);
    var selected = state.projects.find(function (p) { return p._id === state.selectedId; });
    // Right side: split into main and aside
    var rightGrid = document.createElement('div');
    rightGrid.className = 'projects-right-grid';
    var main = document.createElement('div'); main.className = 'project-main';
    var aside = document.createElement('div'); aside.className = 'project-aside';
    rightGrid.appendChild(main); rightGrid.appendChild(aside); right.appendChild(rightGrid);
    renderDetails(main, selected);
    renderSidebar(aside, selected);
  }

  // POST request payment for a project
  function requestPayment(projectId, amount, btn){
    if (!projectId || !amount) return;
    ensureApi(function(api){
      if (btn) btn.disabled = true;
      showProjectsMsg('Requesting payment…','info');
      var path = '/projects/' + encodeURIComponent(projectId) + '/actions/request-payment';
      function done(err, data){
        if (btn) btn.disabled = false;
        if (err){ showProjectsMsg(err.message || 'Failed to request payment','error'); return; }
        showProjectsMsg('Payment requested.','success');
      }
      api(path, 'POST', { amount: amount }, true, function(e,d){
        if (e && /404|not found|405|method/i.test(String(e.message))){
          api('/projects/' + encodeURIComponent(projectId) + '/request-payment','POST',{ amount: amount }, true, done);
        } else { done(e,d); }
      });
    });
  }

  // POST a new project message (expects { text })
  function sendMessage(projectId, text, cb){
    ensureApi(function(api){
      var basePath = '/projects/' + encodeURIComponent(projectId) + '/messages/';
      api(basePath, 'POST', { text: text }, true, function(err, data){
        if (err){
          // fallback to endpoint without trailing slash
          return api(basePath.replace(/\/$/, ''), 'POST', { text: text }, true, function(e2, d2){ if(cb) cb(e2, d2); });
        }
        if(cb) cb(null, data);
      });
    });
  }

  function selectProject(id) {
    state.selectedId = id;
    ensureApi(function (api) {
      // show skeleton in right pane while loading
      renderSkeletonProject();
      api('/projects/' + encodeURIComponent(id), 'GET', null, true, function (err, data) {
        if (err) { showProjectsMsg(err.message || 'Failed to load project', 'error'); return; }
        showProjectsMsg('', '');
        var proj = (data && (data.project || data.data || data)) || null;
        if (!proj) { showProjectsMsg('Project not found.', 'error'); return; }
        // Update local cache copy
        var idx = state.projects.findIndex(function (p) { return p._id === id; });
        if (idx >= 0) state.projects[idx] = proj;
        layoutAndRender();
      });
    });
  }

  // PATCH project status
  function updateProjectStatus(projectId, status, btn) {
    if (!projectId || !status) return;
    ensureApi(function(api){
      if (btn) btn.disabled = true;
      showProjectsMsg('Updating project…', 'info');
      // Try PATCH, fallback to POST if backend expects it
      var path = '/projects/' + encodeURIComponent(projectId);
      function done(err, data){
        if (btn) btn.disabled = false;
        if (err) { showProjectsMsg(err.message || 'Failed to update project', 'error'); return; }
        showProjectsMsg('Project updated.', 'success');
        // Refresh details
        selectProject(projectId);
      }
      // Prefer PATCH
      api(path, 'PATCH', { status: status }, true, function(e, d){
        if (e && /not allowed|405|method/i.test(String(e.message))) {
          api(path, 'POST', { status: status }, true, done);
        } else {
          done(e, d);
        }
      });
    });
  }

  // PATCH approve milestone
  function approveMilestone(projectId, milestoneId, btn) {
    if (!projectId || !milestoneId) return;
    ensureApi(function(api){
      if (btn) btn.disabled = true;
      showProjectsMsg('Approving milestone…', 'info');
      var path = '/projects/' + encodeURIComponent(projectId) + '/milestones/' + encodeURIComponent(milestoneId);
      function done(err, data){
        if (btn) btn.disabled = false;
        if (err) { showProjectsMsg(err.message || 'Failed to approve milestone', 'error'); return; }
        showProjectsMsg('Milestone approved.', 'success');
        selectProject(projectId);
      }
      api(path, 'PATCH', { status: 'approved' }, true, function(e, d){
        if (e && /not allowed|405|method/i.test(String(e.message))) {
          api(path, 'POST', { status: 'approved' }, true, done);
        } else {
          done(e, d);
        }
      });
    });
  }

  // PATCH set a new milestone deadline (employer approves extension)
  function patchMilestoneDeadline(projectId, milestoneId, deadline, btn, cb){
    if (!projectId || !milestoneId || !deadline) return cb && cb(new Error('Missing data'));
    ensureApi(function(api){
      if (btn) btn.disabled = true;
      showProjectsMsg('Updating deadline…', 'info');
      var path = '/projects/' + encodeURIComponent(projectId) + '/milestones/' + encodeURIComponent(milestoneId);
      api(path, 'PATCH', { deadline: deadline }, true, function(err, data){
        if (btn) btn.disabled = false;
        if (err){ if (cb) return cb(err); showProjectsMsg(err.message || 'Failed to update deadline','error'); return; }
        showProjectsMsg('Deadline updated.','success');
        if (cb) cb(null, data);
      });
    });
  }

  // Worker: send an extension request as a structured project message
  function sendExtensionRequest(projectId, milestoneId, newDeadline, reason, cb){
    var payload = { milestoneId: milestoneId || undefined, deadline: newDeadline, reason: reason || '' };
    // Include milestone title in message if available
    try {
      var proj = state.projects.find(function(pp){ return pp._id === projectId; });
      if (proj && Array.isArray(proj.milestones)){
        var ms = proj.milestones.find(function(mm){ return (mm._id||'') === (milestoneId||''); });
        if (ms && ms.title) payload.milestoneTitle = ms.title;
      }
    } catch(_){ }
    sendMessage(projectId, '[REQUEST:EXTEND]'+JSON.stringify(payload), function(err, data){ if (cb) cb(err, data); });
  }

  // PATCH project milestones array at /projects/:id { milestones: [...] }
  function updateProjectMilestones(projectId, milestones, btn){
    if (!projectId || !milestones) return;
    ensureApi(function(api){
      if (btn) btn.disabled = true;
      showProjectsMsg('Updating milestones…', 'info');
      var path = '/projects/' + encodeURIComponent(projectId);
      api(path, 'PATCH', { milestones: milestones }, true, function(err, data){
        if (btn) btn.disabled = false;
        if (err) { showProjectsMsg(err.message || 'Failed to update milestones', 'error'); return; }
        showProjectsMsg('Milestones updated.', 'success');
        selectProject(projectId);
      });
    });
  }

  // Generic helper to set milestone status (worker-friendly)
  function setMilestoneStatus(projectId, milestoneId, status, btn){
    if (!projectId || !milestoneId || !status) return;
    ensureApi(function(api){
      if (btn) btn.disabled = true;
      showProjectsMsg('Updating milestone…', 'info');
      var path = '/projects/' + encodeURIComponent(projectId) + '/milestones/' + encodeURIComponent(milestoneId);
      api(path, 'PATCH', { status: status }, true, function(err, data){
        if (btn) btn.disabled = false;
        if (err) { showProjectsMsg(err.message || 'Failed to update milestone', 'error'); return; }
        showProjectsMsg('Milestone updated.', 'success');
        selectProject(projectId);
      });
    });
  }

  // Worker convenience wrapper to submit a milestone
  function submitMilestone(projectId, milestoneId, btn){
    setMilestoneStatus(projectId, milestoneId, 'submitted', btn);
  }

  // Upload a file and create a project submission
  function uploadWorkSubmission(projectId, file, note, milestoneId, cb){
    if (!projectId || !file) return cb && cb(new Error('Missing project or file'));
    // 1) Upload file
  var t = (typeof getToken==='function')? getToken() : null;
    if (!t) return cb && cb(new Error('Please login again'));
    var fd = new FormData();
    // Use 'file' key to allow images/docs
    fd.append('file', file);
    fetch(API_BASE + '/uploads/file', { method:'POST', headers: { 'Authorization':'Bearer '+t }, body: fd })
      .then(function(r){ return r.json().catch(function(){return {};}).then(function(j){ return { ok:r.ok, data:j, statusText:r.statusText }; }); })
      .then(function(out){
        if (!out.ok) throw new Error((out.data&&out.data.message)||out.statusText||'Upload failed');
        var f = out.data && (out.data.file||out.data);
        var url = f && (f.url || f.absoluteUrl);
        var cid = f && f.cloudinaryId;
        if (!url) throw new Error('Upload completed but no URL');
        // Build absolute URL if helper available
        try { if (window.SLMedia && SLMedia.resolveUrl) url = SLMedia.resolveUrl(url, cid); } catch(_){ }
        // 2) Create submission
        ensureApi(function(api){
          var payload = { fileUrl: url, filename: file.name, note: note||undefined, milestoneId: milestoneId||undefined };
          var path = '/projects/' + encodeURIComponent(projectId) + '/submissions';
          api(path, 'POST', payload, true, function(err, data){
            if (!err) return cb && cb(null, data);
            // Fallback: post a message with the file link
            var txt = 'Submitted work: ' + (file.name||'file') + ' ' + url + (note? (' — ' + note) : '');
            api('/projects/' + encodeURIComponent(projectId) + '/messages', 'POST', { text: txt }, true, function(e2, d2){
              if (e2) return cb && cb(err); // original error
              cb && cb(null, d2);
            });
          });
        });
      })
      .catch(function(e){ cb && cb(e); });
  }

  function loadProjects() {
    var cont = $('.section#project .content-page-details .project-cont');
    if (!cont) return;
    ensureApi(function (api) {
      // Initial grid skeleton
      renderSkeletonGrid();
      api('/projects', 'GET', null, true, function (err, data) {
        if (err) {
          if (/unauthorized|401|forbidden/i.test(err.message)) {
            showProjectsMsg('Please sign in to view projects.', 'error');
          } else {
            showProjectsMsg(err.message || 'Failed to load projects', 'error');
          }
          return;
        }
        showProjectsMsg('', '');
        state.projects = (data && (data.projects || data.data || [])) || [];
        // Pick first project by default, if any
        state.selectedId = state.selectedId || (state.projects[0] && state.projects[0]._id) || null;
        layoutAndRender();
      });
    });
  }

  function wireTabLoader() {
    var tab = document.getElementById('tab-projects');
    if (!tab) { loadProjects(); return; }
    if (tab.checked) loadProjects();
    tab.addEventListener('change', function(){ if (tab.checked) loadProjects(); });
  }

  document.addEventListener('DOMContentLoaded', function(){
    // Only run on Client dashboard pages that have the project section
    var projectSection = document.querySelector('.section#project .project-cont');
    if (!projectSection) return;
    // Load current user (for role-based UI) alongside projects
    try { ensureMe(function(){}); } catch(_){ }
    wireTabLoader();
  });

  // Minimal styles to make the list/details layout reasonable without touching existing CSS
  var css = '\n.projects-grid{display:grid;grid-template-columns:200px 1fr;gap:10px;align-items:start}\n.project-list{display:flex;flex-direction:column;gap:8px;background:#fff;border:1px solid #eee;border-radius:10px;padding:8px}\n.project-item-row{display:flex;justify-content:space-between;gap:12px;padding:12px;border-radius:8px;border:1px solid #f0f0f0;cursor:pointer}\n.project-item-row:hover{background:#fafafa}\n.project-item-row.selected{outline:2px solid #2f6feb}\n.project-item-row .row-main h3{margin:0 0 4px 0;font-size:16px}\n.project-item-row .meta{color:#666;font-size:12px}\n.project-item-row .row-side{display:flex;flex-direction:column;align-items:flex-end;gap:6px;color:#444;font-size:12px}\n/* Right pane split */\n.projects-right-grid{display:grid;grid-template-columns:1fr 0.5fr;gap:20px}\n@media(max-width: 980px){.projects-grid{grid-template-columns:1fr}.project-item-row .row-side{align-items:flex-start}.projects-right-grid{grid-template-columns:1fr}}\n/* Skeleton styles */\n@keyframes skl{0%{background-position:-200px 0}100%{background-position:calc(200px + 100%) 0}}\n.skl-line{height:12px;border-radius:6px;background:linear-gradient(90deg,#f2f2f2 25%,#e9e9e9 37%,#f2f2f2 63%);background-size:200px 100%;animation:skl 1.2s ease-in-out infinite;margin:6px 0}\n.skl-line.light{opacity:.8}\n.skl-line.w-60{width:60px}.skl-line.w-70{width:70px}.skl-line.w-80{width:80px}.skl-line.w-90{width:90px}.skl-line.w-100{width:100px}.skl-line.w-120{width:120px}.skl-line.w-140{width:140px}.skl-line.w-160{width:160px}.skl-line.w-180{width:180px}.skl-line.w-200{width:200px}\n.skl-bar{height:10px;border-radius:6px;background:linear-gradient(90deg,#f2f2f2 25%,#e9e9e9 37%,#f2f2f2 63%);background-size:200px 100%;animation:skl 1.2s ease-in-out infinite}\n.skl-card{height:68px;border-radius:10px;border:1px solid #eee;background:linear-gradient(90deg,#fafafa 25%,#f0f0f0 37%,#fafafa 63%);background-size:200px 100%;animation:skl 1.2s ease-in-out infinite;margin-bottom:10px}\n.skl-msg-list{border:1px solid #eee;border-radius:8px;padding:8px;background:#fff}\n.skl-msg{height:46px;border-bottom:1px solid #f3f4f6;background:linear-gradient(90deg,#fafafa 25%,#f0f0f0 37%,#fafafa 63%);background-size:200px 100%;animation:skl 1.2s ease-in-out infinite}\n.skl-msg:last-child{border-bottom:none}\n';
  var styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);
})();
