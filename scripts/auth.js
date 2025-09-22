// Very simple auth script (novice friendly)
// It handles: Sign Up, Login, Save token, route guard, OTP helpers, and toggling employer fields

// Read API base from a meta tag so it can be changed without editing JS
var API_BASE = (function () {
  var meta = document.querySelector('meta[name="sl-api-base"]');
  if (meta && meta.content) return meta.content;
  // Fallback default (kept for local testing or if meta is missing)
  return 'https://skill-link-gg2c.onrender.com/api';
})();
// Expose globally for other scripts
try { window.API_BASE = API_BASE; } catch (e) {}

function showMessageById(elementId, text, type) {
  var el = document.getElementById(elementId);
  if (!el) return;
  if (!type) type = 'info';
  el.textContent = text || '';
  el.className = 'msg ' + type; // needs .msg styles
  el.hidden = !text;
}

// Token helpers: prefer sessionStorage by default.
function saveToken(token, remember) {
  try {
    // Always put it in sessionStorage
    sessionStorage.setItem('sl_token', token);
    // If user opted to stay logged in, also store in localStorage
    if (remember) {
      localStorage.setItem('sl_token', token);
    } else {
      localStorage.removeItem('sl_token');
    }
  } catch (e) {}
}
function getToken() {
  try {
    // Read from session first, then fallback to local
    return (
      sessionStorage.getItem('sl_token') ||
      localStorage.getItem('sl_token')
    );
  } catch (e) {
    return null;
  }
}
function clearToken() {
  try {
    sessionStorage.removeItem('sl_token');
    localStorage.removeItem('sl_token');
  sessionStorage.removeItem('sl_email');
  localStorage.removeItem('sl_email');
  } catch (e) {}
}

function callApi(path, method, body, useAuth, done) {
  var headers = { 'Content-Type': 'application/json' };
  if (useAuth) {
    var t = getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
  }
  headers['Accept'] = 'application/json';
  fetch(API_BASE + path, {
    method: method || 'GET',
    headers: headers,
    body: body ? JSON.stringify(body) : undefined
  })
    .then(function (res) {
      var ct = res.headers.get('content-type') || '';
      var isJson = ct.indexOf('application/json') !== -1;
      if (!isJson) return res.text().then(function (t) { return { ok: res.ok, statusText: res.statusText, data: t }; });
      return res.json().then(function (j) { return { ok: res.ok, statusText: res.statusText, data: j }; });
    })
    .then(function (out) {
      if (!out.ok) {
        var msg = (out.data && (out.data.message || out.data.error)) || out.statusText || 'Request failed';
        return done(new Error(msg));
      }
      done(null, out.data);
    })
    .catch(function (err) {
      done(err);
    });
}

// Extract token from varying API response shapes
function extractToken(data) {
  if (!data) return null;
  if (data.token) return data.token;
  if (data.accessToken) return data.accessToken;
  if (data.jwt) return data.jwt;
  if (data.data && (data.data.token || data.data.accessToken)) {
    return data.data.token || data.data.accessToken;
  }
  return null;
}

function setupSignup() {
  var form = document.getElementById('signup-form');
  if (!form) return;

  var radios = form.querySelectorAll('input[name="accountType"]');
  var employerFields = document.getElementById('employer-fields');

  function toggleEmployerFields() {
    var selected = 'worker';
    for (var i = 0; i < radios.length; i++) {
      if (radios[i].checked) {
        selected = radios[i].value;
        break;
      }
    }
    if (employerFields) {
      if (selected === 'employer') {
        employerFields.style.display = 'grid';
      } else {
        employerFields.style.display = 'none';
      }
    }
  }

  for (var i = 0; i < radios.length; i++) {
    radios[i].addEventListener('change', toggleEmployerFields);
  }
  toggleEmployerFields();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    showMessageById('signup-msg', 'Creating your account...', 'info');

    var firstNameInput = document.getElementById('firstName');
    var lastNameInput = document.getElementById('lastName');
    var emailInput = document.getElementById('email');
  var phoneInput = document.getElementById('phone');
    var passwordInput = document.getElementById('password');
    var confirmPasswordInput = document.getElementById('confirmPassword');

    var accountType = 'worker';
    for (var j = 0; j < radios.length; j++) {
      if (radios[j].checked) {
        accountType = radios[j].value;
        break;
      }
    }

    if (passwordInput && confirmPasswordInput && passwordInput.value !== confirmPasswordInput.value) {
      showMessageById('signup-msg', 'Passwords do not match.', 'error');
      return;
    }

    if (!firstNameInput.value.trim() || !lastNameInput.value.trim() || !emailInput.value.trim() || !phoneInput.value.trim() || !passwordInput.value) {
      showMessageById('signup-msg', 'Please fill all required fields (first, last, email, phone, password).', 'error');
      return;
    }

    var payload = {
      firstname: firstNameInput ? firstNameInput.value.trim() : '',
      lastname: lastNameInput ? lastNameInput.value.trim() : '',
      email: emailInput ? emailInput.value.trim() : '',
      phone: phoneInput ? phoneInput.value.trim() : '',
      password: passwordInput ? passwordInput.value : '',
      accountType: accountType
    };

    if (accountType === 'employer') {
      var companyNameInput = document.getElementById('companyName');
      var companyLocationInput = document.getElementById('companyLocation');
      payload.employer = {
        companyName: companyNameInput ? companyNameInput.value.trim() : '',
        location: companyLocationInput ? companyLocationInput.value.trim() : ''
      };
    }

    callApi('/auth/register', 'POST', payload, false, function (err, data) {
      if (err) {
        showMessageById('signup-msg', err.message || 'Registration failed', 'error');
        return;
      }
      var tok = extractToken(data) || (data && data.token);
      if (tok) { saveToken(tok); }
      // store email for OTP
      try {
        var emailInput = document.getElementById('email');
        var email = emailInput ? emailInput.value.trim() : '';
        sessionStorage.setItem('sl_email', email);
      } catch (e) {}
      showMessageById('signup-msg', 'Account created! Verify your email…', 'success');
      setTimeout(function () {
        window.location.href = './email.html';
      }, 700);
    });
  });
}

function setupLogin() {
  var form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    showMessageById('login-msg', 'Signing you in...', 'info');

    var emailInput = document.getElementById('login-email');
    var passwordInput = document.getElementById('password');
    var payload = {
      email: emailInput ? emailInput.value.trim() : '',
      password: passwordInput ? passwordInput.value : ''
    };

    var remember = false;
    var rememberBox = document.getElementById('keep-logged-in');
    if (rememberBox) remember = !!rememberBox.checked;

    callApi('/auth/login', 'POST', payload, false, function (err, data) {
      if (err) {
        showMessageById('login-msg', err.message || 'Login failed', 'error');
        return;
      }
      var tok = extractToken(data);
      if (tok) saveToken(tok, remember);
      // persist email for OTP page convenience
      try { sessionStorage.setItem('sl_email', payload.email); } catch (e) {}
      showMessageById('login-msg', 'Login successful! Redirecting...', 'success');
      setTimeout(function () {
        var accType = data && data.user ? (data.user.accountType || data.user.role) : null;
        if (!accType) {
          // Try to fetch user profile to determine where to go
          return getMe(function (e2, me) {
            var type = me && (me.accountType || me.role);
            if (type === 'employer' || type === 'client') {
              window.location.href = '../Client/index.html';
            } else {
              window.location.href = '../Worker/index.html';
            }
          });
        }
        if (accType === 'employer' || accType === 'client') window.location.href = '../Client/index.html';
        else window.location.href = '../Worker/index.html';
      }, 600);
    });
  });
}

// Optional helpers
function getMe(callback) {
  callApi('/auth/me', 'GET', null, true, function (err, data) {
    if (err) return callback(err);
    callback(null, data ? data.user : null);
  });
}
function logout() {
  clearToken();
}

// Simple route guard for protected pages
function guardProtectedPage() {
  // Only run on dashboard pages (Client/Worker). If not present, skip.
  var isClient = !!document.querySelector('title') && /Client/i.test(document.title);
  var isWorker = !!document.querySelector('title') && /Worker/i.test(document.title);
  var isDashboard = isClient || isWorker || document.getElementById('tab-dashboard');
  if (!isDashboard) return;
  var token = getToken();
  if (!token) {
    // Not logged in -> go to Sign-In
    window.location.href = '../Sign-In/index.html';
    return;
  }
  // Verify and enforce the right area
  getMe(function (err, me) {
    if (err || !me) { window.location.href = '../Sign-In/index.html'; return; }
    var type = me.accountType || me.role;
    if ((type === 'employer' || type === 'client')) {
      // Ensure we're on Client area
      var onClient = /Client\//.test(location.pathname);
      if (!onClient) window.location.href = '../Client/index.html';
    } else {
      // Worker area
      var onWorker = /Worker\//.test(location.pathname);
      if (!onWorker) window.location.href = '../Worker/index.html';
    }
  });
}

// Bind logout section buttons when present
function setupLogoutUI() {
  var yesBtn = document.querySelector('#logout .log-but1');
  var cancelBtn = document.querySelector('#logout .log-but2');
  if (yesBtn) {
    yesBtn.addEventListener('click', function () {
      try { logout(); } catch (e) {}
      // Redirect to Sign-In
      window.location.href = '../Sign-In/index.html';
    });
  }
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function () {
      var dash = document.getElementById('tab-dashboard');
      if (dash) dash.checked = true;
    });
  }

  // Improve side-menu UX: when Logout tab is selected, focus the confirm button and scroll into view
  var logoutTab = document.getElementById('tab-logout');
  if (logoutTab) {
    logoutTab.addEventListener('change', function () {
      if (!logoutTab.checked) return;
      setTimeout(function(){
        var confirmBtn = document.querySelector('#logout .log-but1');
        if (confirmBtn && typeof confirmBtn.focus === 'function') confirmBtn.focus();
        var section = document.getElementById('logout');
        if (section && typeof section.scrollIntoView === 'function') section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    });
  }

  // Optional: double-click the Logout menu label to instant-logout (skip confirmation)
  var logoutLabels = document.querySelectorAll('label[for="tab-logout"]');
  if (logoutLabels && logoutLabels.length) {
    Array.prototype.forEach.call(logoutLabels, function(lbl){
      // Single click: immediate logout (matches the sidebar UX in the screenshot)
      lbl.addEventListener('click', function (e) {
        e.preventDefault();
        try { logout(); } catch (e2) {}
        window.location.href = '../Sign-In/index.html';
      });
      // Keyboard support for accessibility
      lbl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          try { logout(); } catch (e2) {}
          window.location.href = '../Sign-In/index.html';
        }
      });
    });
  }
}

// Optional: bind file upload inputs to /uploads/file
function setupUploadHelper(){
  var input = document.getElementById('file-upload');
  if (!input) return;
  var out = document.getElementById('file-upload-msg');
  function msg(t,ty){ if(!out) return; out.textContent=t||''; out.className='msg '+(ty||'info'); out.hidden=!t; }
  input.addEventListener('change', function(){
    var f = input.files && input.files[0];
    if (!f){ msg('No file selected','error'); return; }
    msg('Uploading '+f.name+'…','info');
    var t = getToken(); if(!t){ msg('Please login first','error'); return; }
    var formData = new FormData();
    formData.append('file', f);
    fetch(API_BASE + '/uploads/file', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + t },
      body: formData
    })
    .then(function(r){ return r.json().catch(function(){return {};}).then(function(j){ return { ok:r.ok, data:j, statusText:r.statusText }; }); })
    .then(function(out){ if(!out.ok){ throw new Error((out.data&&out.data.message)||out.statusText||'Upload failed'); }
      var file = out.data && (out.data.file||out.data);
      msg('Uploaded: ' + (file && (file.absoluteUrl||file.url||'file')), 'success');
      // publish a custom event in case pages want to react
      try { document.dispatchEvent(new CustomEvent('sl:fileUploaded', { detail: file })); } catch (e) {}
    })
    .catch(function(err){ msg(err.message||'Upload failed','error'); });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  setupSignup();
  setupLogin();
  setupLogoutUI();
  setupUploadHelper();
  guardProtectedPage();
});

// Expose a tiny API for debugging
window.SkillLinkAuth = { getMe: getMe, logout: logout, saveToken: saveToken, getToken: getToken };
