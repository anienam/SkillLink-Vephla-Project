// Jobs page client logic: wires the Post Job form to the API
(function () {
  function $(id) { return document.getElementById(id); }
  function showMsg(text, type) {
    var el = $('postjob-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'msg ' + (type || 'info');
    el.hidden = !text;
  }

  function parseSkills(raw) {
    if (!raw) return [];
    // split by comma or whitespace, trim, remove empties, lowercase
    var parts = raw
      .split(/[,\n]/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
    // If no commas were used, allow space-separated words as fallback
    if (parts.length <= 1) {
      parts = raw
        .split(/\s+/)
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
    }
    return parts;
  }

  function onSubmit(evt) {
    evt.preventDefault();
    var title = $('job-title') ? $('job-title').value.trim() : '';
    var description = $('job-description') ? $('job-description').value.trim() : '';
    var min = $('job-budget-min') ? parseInt($('job-budget-min').value, 10) : null;
    var max = $('job-budget-max') ? parseInt($('job-budget-max').value, 10) : null;
    var timeline = $('job-deadline') ? $('job-deadline').value : '';
    var reqSkills = parseSkills($('job-skill') ? $('job-skill').value : '');

    if (!title || !description || isNaN(min) || isNaN(max) || !timeline || !reqSkills.length) {
      showMsg('Please complete all fields.', 'error');
      return;
    }
    if (min > max) {
      showMsg('Min budget cannot exceed max budget.', 'error');
      return;
    }

    // Ensure date in YYYY-MM-DD format
    try {
      if (timeline && /\d{4}-\d{2}-\d{2}/.test(timeline) === false) {
        var d = new Date(timeline);
        if (!isNaN(d.getTime())) {
          var iso = d.toISOString().slice(0, 10);
          timeline = iso;
        }
      }
    } catch (e) {}

    // Require auth
    if (typeof getToken === 'function' && !getToken()) {
      showMsg('You need to log in to post a job. Redirecting…', 'error');
      setTimeout(function(){ window.location.href = '../Sign-In/index.html'; }, 900);
      return;
    }

    var payload = {
      title: title,
      description: description,
      budgetRange: { min: min, max: max },
      timeline: timeline,
      requiredSkills: reqSkills
    };

    showMsg('Posting job…', 'info');
    if (typeof callApi !== 'function') {
      showMsg('API helper not loaded.', 'error');
      return;
    }

    callApi('/jobs', 'POST', payload, true, function (err, data) {
      if (err) {
        showMsg(err.message || 'Failed to post job', 'error');
        return;
      }
      showMsg('Job posted successfully!', 'success');
      // Clear form
      try {
        $('post-job-form').reset();
      } catch (e) {}
      // Optional: switch to Active Jobs tab if available
      var activeRadio = document.getElementById('active-job');
      if (activeRadio) activeRadio.checked = true;
  // Refresh the jobs list so the new job appears
  try { loadJobs(); } catch (e) {}
    });
  }

  function wireLogout() {
    // Logout button on Client page
    var yesBtn = document.querySelector('.logout-page .log-but1');
    if (yesBtn) {
      yesBtn.addEventListener('click', function(){
        if (window.SkillLinkAuth && typeof window.SkillLinkAuth.logout === 'function') {
          window.SkillLinkAuth.logout();
        }
        window.location.href = '../Sign-In/index.html';
      });
    }
  }

  function updateBudgetPreview() {
    var prev = document.getElementById('budget-preview');
    if (!prev) return;
    var minEl = document.getElementById('job-budget-min');
    var maxEl = document.getElementById('job-budget-max');
    var min = minEl && minEl.value ? parseInt(minEl.value, 10) : null;
    var max = maxEl && maxEl.value ? parseInt(maxEl.value, 10) : null;

    if (min != null && max != null && !isNaN(min) && !isNaN(max)) {
      prev.textContent = 'N' + min + ' - N' + max;
    } else if (min != null && !isNaN(min)) {
      prev.textContent = 'N' + min + ' - ';
    } else if (max != null && !isNaN(max)) {
      prev.textContent = ' - N' + max;
    } else {
      prev.textContent = '';
    }
  }

  function wireBudgetInputs() {
    var minEl = document.getElementById('job-budget-min');
    var maxEl = document.getElementById('job-budget-max');
    if (!minEl || !maxEl) return;

    function clampAndSync() {
      var min = parseInt(minEl.value || '0', 10);
      var max = parseInt(maxEl.value || '0', 10);
      if (!isNaN(min) && !isNaN(max) && min > max) {
        // If min surpasses max, push max up to min
        maxEl.value = String(min);
      }
      if (!isNaN(max) && !isNaN(min) && max < min) {
        // If max falls below min, pull min down to max
        minEl.value = String(max);
      }
      updateBudgetPreview();
    }

    minEl.addEventListener('input', clampAndSync);
    maxEl.addEventListener('input', clampAndSync);
    updateBudgetPreview();
  }

  function wireBudgetSliders() {
    var minR = document.getElementById('job-budget-min-range');
    var maxR = document.getElementById('job-budget-max-range');
    var minN = document.getElementById('job-budget-min');
    var maxN = document.getElementById('job-budget-max');
    if (!minR || !maxR || !minN || !maxN) return;

    function syncFromRanges() {
      var min = parseInt(minR.value || '0', 10);
      var max = parseInt(maxR.value || '0', 10);
      if (min > max) {
        // keep them touching (two-hand slider behavior)
        if (this === minR) {
          max = min;
          maxR.value = String(max);
        } else {
          min = max;
          minR.value = String(min);
        }
      }
      minN.value = String(min);
      maxN.value = String(max);
      updateBudgetPreview();
    }

    function syncFromNumbers() {
      var min = parseInt(minN.value || '0', 10);
      var max = parseInt(maxN.value || '0', 10);
      if (!isNaN(min)) minR.value = String(min);
      if (!isNaN(max)) maxR.value = String(max);
      if (min > max) {
        // same guard as above
        max = min;
        maxN.value = String(max);
        maxR.value = String(max);
      }
      updateBudgetPreview();
    }

    minR.addEventListener('input', syncFromRanges);
    maxR.addEventListener('input', syncFromRanges);
    minN.addEventListener('input', syncFromNumbers);
    maxN.addEventListener('input', syncFromNumbers);

    // Initialize with number values if present, otherwise with ranges
    if (minN.value || maxN.value) {
      syncFromNumbers();
    } else {
      syncFromRanges();
    }
  }

  function showJobsMsg(text, type) {
    var el = document.getElementById('jobs-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'msg ' + (type || 'info');
    el.hidden = !text;
  }

  function renderJobs(jobs) {
    var list = document.getElementById('active-jobs-list');
    if (!list) return;
    list.innerHTML = '';
    if (!jobs || !jobs.length) {
      list.innerHTML = '<p>No jobs found yet.</p>';
      return;
    }
    jobs.forEach(function (job) {
      var min = job && job.budgetRange ? job.budgetRange.min : '';
      var max = job && job.budgetRange ? job.budgetRange.max : '';
      var when = job && job.timeline ? job.timeline : '';
      // Keep date readable (YYYY-MM-DD if provided)
      var dateText = when ? ('Timeline: ' + String(when).slice(0,10)) : '';
      var item = document.createElement('div');
      item.className = 'active-job-item';
      item.innerHTML =
        '<h2>' + (job.title || 'Untitled') + '</h2>' +
        '<p>' + (job.description || '') + '</p>' +
        '<div class="flat">' +
          '<div class="active-job-info">' +
            '<p>N' + (min || 0) + '-N' + (max || 0) + '</p>' +
            '<p>' + dateText + '</p>' +
          '</div>' +
          '<div class="active-job-button">' +
            '<button class="but4" data-id="' + (job._id || '') + '">Edit</button>' +
            '<button class="but5" data-id="' + (job._id || '') + '">View applicants</button>' +
            '<button class="but6" data-id="' + (job._id || '') + '">Ratings</button>' +
          '</div>' +
        '</div>';
      list.appendChild(item);
    });
  }

  function loadJobs() {
    var list = document.getElementById('active-jobs-list');
    if (!list || typeof callApi !== 'function') return;
    showJobsMsg('Loading jobs…', 'info');
    callApi('/jobs', 'GET', null, true, function (err, data) {
      if (err) {
        showJobsMsg(err.message || 'Failed to load jobs', 'error');
        return;
      }
      showJobsMsg('', '');
      var jobs = (data && (data.jobs || data.data || [])) || [];
      renderJobs(jobs);
    });
  }

  // Load when Active Jobs tab is shown
  function wireActiveJobsLoader() {
    var activeRadio = document.getElementById('active-job');
    if (!activeRadio) return;
    // If already selected, load immediately
    if (activeRadio.checked) loadJobs();
    // Load whenever user switches to Active Jobs
    activeRadio.addEventListener('change', function(){
      if (activeRadio.checked) loadJobs();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var form = $('post-job-form');
    if (form) form.addEventListener('submit', onSubmit);
    wireLogout();
    wireBudgetInputs();
    wireBudgetSliders();
    wireActiveJobsLoader();
  });
})();
