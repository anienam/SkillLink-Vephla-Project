// Talent Management JavaScript - Simple Novice Code
// This handles worker search, profile viewing, and invitations

// Function to get API token from shared auth helpers
function getApiToken() {
    try {
        if (typeof getToken === 'function') {
            const t = getToken();
            return t ? `Bearer ${t}` : '';
        }
        return '';
    } catch (_) { return ''; }
}

// Get API base URL from meta tag, allow local override
function getApiBase() {
    const metaTag = document.querySelector('meta[name="sl-api-base"]');
    return metaTag ? metaTag.content : 'https://skill-link-gg2c.onrender.com/api';
}
// Ensure a single global API_BASE exists (auth.js may define it; allow override via localStorage)
window.API_BASE = window.API_BASE || getApiBase();

// Store current workers list and query state
let allWorkers = [];
let currentPage = 1;
let totalPages = 1;
let isLoading = false;
// Keep last-used filters to reuse across pagination
let currentFilters = {
    q: '',
    skills: '',
    location: '',
    availability: '',
    minRate: 0,
    maxRate: 10000,
    minRating: '',
    page: 1,
    limit: 8
};

// Simple debounce utility
function debounce(fn, delay = 400) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

// Build headers, adding Authorization only if present
function buildHeaders() {
    const headers = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    const tok = getApiToken();
    if (tok) headers['Authorization'] = tok;
    return headers;
}

// Build a query string from filters (ignore empty values)
function buildQuery(filters) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && `${v}` !== '') {
            params.set(k, v);
        }
    });
    return params.toString();
}

// Fetch workers with current filters
function fetchWorkers(filters) {
    if (isLoading) return;

    // Merge with defaults and keep in state
    currentFilters = { ...currentFilters, ...filters };
    currentPage = Number(currentFilters.page) || 1;

    console.log('Fetching workers with filters:', currentFilters);
    showLoading();
    isLoading = true;

    const qs = buildQuery(currentFilters);
    const url = `${API_BASE}/workers/public${qs ? `?${qs}` : ''}`;

    fetch(url, {
        method: 'GET',
        headers: buildHeaders()
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('Workers data:', data);
            // Robustly extract items from multiple possible response shapes
            const arr = Array.isArray(data?.items) ? data.items
                      : Array.isArray(data?.data?.items) ? data.data.items
                      : Array.isArray(data?.workers) ? data.workers
                      : Array.isArray(data?.data?.workers) ? data.data.workers
                      : Array.isArray(data?.results) ? data.results
                      : Array.isArray(data) ? data
                      : [];
            const pagination = (data && (data.pagination || data.meta)) || (data?.data && (data.data.pagination || data.data.meta)) || {};
            allWorkers = arr.slice();
            // Derive totalPages if provided, else estimate
            const total = Number(pagination.total || pagination.totalItems || arr.length || 0);
            const limit = Number(pagination.limit || currentFilters.limit || 8);
            totalPages = Math.max(1, Math.ceil((total || arr.length) / (limit || 1)));
            displayWorkers(allWorkers);
            updatePagination();
        })
        .catch(error => {
            console.error('Error getting workers:', error);
            showErrorMessage('Failed to load workers. Please check if the API server is running.');
        })
        .finally(() => {
            hideLoading();
            isLoading = false;
        });
}

// Function to get all workers
function getAllWorkers() {
    // Show more workers by default so the list feels complete
    fetchWorkers({ page: 1, limit: 50 });
}

// Function to search workers
function searchWorkers() {
    const searchInput = document.querySelector('#talent-search');
    const searchText = searchInput ? searchInput.value.trim() : '';

    // Pull maxRate from slider when available
    const rateSlider = document.querySelector('.input-rate input[type="range"]');
    const maxRate = rateSlider && rateSlider.value ? Number(rateSlider.value) : currentFilters.maxRate;

    const filters = {
        ...currentFilters,
        q: searchText,
        maxRate,
        minRate: currentFilters.minRate || 0,
        page: 1,
        limit: 8
    };

    fetchWorkers(filters);
}

// Function to display workers in the UI
function displayWorkers(workers) {
    const talentContainer = document.querySelector('.talent-cont');
    
    if (!talentContainer) {
        console.error('Talent container not found');
        return;
    }
    
    // Clear existing content
    talentContainer.innerHTML = '';

    if (!Array.isArray(workers) || workers.length === 0) {
        talentContainer.innerHTML = '<p>No workers found.</p>';
        return;
    }
    
    // Create worker cards
    workers.forEach(worker => {
        const workerCard = createWorkerCard(worker);
        talentContainer.appendChild(workerCard);
    });
}

// Function to create a worker card
function createWorkerCard(worker) {
    console.log('Creating card for worker:', worker);
    
    const card = document.createElement('div');
    card.className = 'talent-cards';
    
    // Get worker details with better fallbacks for actual API data
    const name = worker.name || worker.fullName || [worker.firstname, worker.lastname].filter(Boolean).join(' ') || 'Unknown Worker';
    const skilledWorker = worker.skilledWorker || worker.profile || {};
    const title = skilledWorker.professionalTitle || 'Professional';
    const hourlyRate = skilledWorker.hourlyRate || 0;
    const bio = skilledWorker.shortBio || 'No description available';
    const skills = skilledWorker.primarySkills || [];
    const location = skilledWorker.location || skilledWorker.city || 'Location not specified';
    const experience = skilledWorker.yearsOfExperience || 0;
    
    // Handle profile image via Cloudinary-aware resolver
    let profileImage = skilledWorker.profileImage || worker.profileImage || '';
    const pid = skilledWorker.cloudinaryId || worker.cloudinaryId || '';
    if (window.SLMedia && typeof SLMedia.resolveUrl === 'function') {
        profileImage = SLMedia.resolveUrl(profileImage || '', pid || '');
    } else if (profileImage && !/^https?:\/\//i.test(profileImage)) {
        const baseUrl = API_BASE.replace('/api', '');
        profileImage = baseUrl + (profileImage.startsWith('/') ? '' : '/') + profileImage;
    }
    
    console.log('Worker details:', { name, title, hourlyRate, bio, skills, location, profileImage });
    
    // Create star rating (for now just show 4 stars for workers with data, 0 for empty ones)
    const hasSkills = skills.length > 0;
    const starCount = hasSkills ? 4 : 0;
    const starSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="m12 17.275l-4.15 2.5q-.275.175-.575.15t-.525-.2t-.35-.437t-.05-.588l1.1-4.725L3.775 10.8q-.25-.225-.312-.513t.037-.562t.3-.45t.55-.225l4.85-.425l1.875-4.45q.125-.3.388-.45t.537-.15t.537.15t.388.45l1.875 4.45l4.85.425q.35.05.55.225t.3.45t.038.563t-.313.512l-3.675 3.175l1.1 4.725q.075.325-.05.588t-.35.437t-.525.2t-.575-.15z"/></svg>';
    const emptyStar = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" d="m12 17.275l-4.15 2.5q-.275.175-.575.15t-.525-.2t-.35-.437t-.05-.588l1.1-4.725L3.775 10.8q-.25-.225-.312-.513t.037-.562t.3-.45t.55-.225l4.85-.425l1.875-4.45q.125-.3.388-.45t.537-.15t.537.15t.388.45l1.875 4.45l4.85.425q.35.05.55.225t.3.45t.038.563t-.313.512l-3.675 3.175l1.1 4.725q.075.325-.05.588t-.35.437t-.525.2t-.575-.15z"/></svg>';
    
    let starsHtml = '';
    for (let i = 0; i < 5; i++) {
        starsHtml += i < starCount ? starSvg : emptyStar;
    }
    
    card.innerHTML = `
        <div class="talent-header">
            <p class="talent-prof" style="background-image: url('${profileImage}'); background-size: cover; background-position: center; width: 60px; height: 60px; border-radius: 50%; background-color: #f0f0f0;"></p>
            <div class="talent-info">
                <h2>${name}</h2>
                <h4>${title}</h4>
                <p class="star-rating" style="color: #ffa500;">
                    ${starsHtml}
                </p>
                ${skills.length > 0 ? `<p class="worker-skills" style="font-size: 12px; color: #666; margin-top: 5px;">Skills: ${skills.join(', ')}</p>` : ''}
                ${location ? `<p class="worker-location" style="font-size: 12px; color: #666; margin-top: 2px;">📍 ${location}</p>` : ''}
                ${experience > 0 ? `<p class="worker-experience" style="font-size: 12px; color: #666; margin-top: 2px;">🎯 ${experience} years experience</p>` : ''}
            </div>
        </div>    
        <p class="talent-charge"><span>${hourlyRate}</span>/hour</p>
        <p class="talent-details">${bio}</p>
        <div class="talent-button">
            <button class="t-but1" onclick="inviteWorker('${worker._id || worker.id || ''}')">Invite to Job</button>
            <button class="t-but2" onclick="viewWorkerProfile('${worker._id || worker.id || ''}')">View Profile</button>
        </div>
    `;
    
    return card;
}

// Function to view worker profile
function viewWorkerProfile(workerId) {
    console.log('Getting profile for worker:', workerId);

    if (!workerId) {
        showErrorMessage('Missing worker id');
        return;
    }

    // Open a lightweight loading modal first
    const overlay = document.createElement('div');
    overlay.className = 'worker-profile-modal';
    overlay.style.cssText = `position: fixed; inset: 0; background: rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index: 2000;`;
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff; width:100%; max-width:720px; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,.2)';
    box.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid #eee;">
          <h3 style="margin:0; font-size:18px;">Worker Profile</h3>
          <button type="button" aria-label="Close" style="background:none; border:none; font-size:20px; cursor:pointer;" onclick="closeProfileModal()">×</button>
        </div>
        <div style="padding:16px; min-height:220px; display:flex; align-items:center; justify-content:center; color:#666;">
          Loading profile…
        </div>`;
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    window.currentProfileModal = overlay;

    fetch(`${API_BASE}/workers/${workerId}`, {
        method: 'GET',
        headers: buildHeaders()
    })
    .then(response => {
        if (!response.ok) {
            return response.json().catch(() => ({})).then(j => {
                const msg = j && (j.message || j.error) ? (j.message || j.error) : `HTTP ${response.status}`;
                throw new Error(msg);
            });
        }
        return response.json();
    })
    .then(data => {
        console.log('Worker profile:', data);
        const w = data.worker || data.data || data;
        showWorkerProfile(w);
    })
    .catch(error => {
        console.error('Error getting worker profile:', error);
        if (window.currentProfileModal) {
            const pane = window.currentProfileModal.querySelector('div > div:nth-child(2)');
            if (pane) {
                pane.innerHTML = `<div style="color:#b91c1c;">${(String(error && error.message || 'Failed to load worker profile.')).slice(0,140)}</div>`;
            }
        } else {
            showErrorMessage('Failed to load worker profile. Please try again.');
        }
    });
}

// Function to show worker profile in a modal or new section
function showWorkerProfile(worker) {
        // Reuse the existing overlay if open; else create one
        let modal = window.currentProfileModal;
        if (!modal) {
                modal = document.createElement('div');
                modal.className = 'worker-profile-modal';
                modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:2000;';
                document.body.appendChild(modal);
                window.currentProfileModal = modal;
        }

        const skilled = worker.skilledWorker || {};
        const fullName = worker.name || [worker.firstname, worker.lastname].filter(Boolean).join(' ') || 'Worker';
        const title = skilled.professionalTitle || '';
        const rate = skilled.hourlyRate != null ? skilled.hourlyRate : '';
        const location = skilled.location || '';
        const xp = skilled.yearsOfExperience || '';
        const bio = skilled.shortBio || '';
        const skills = Array.isArray(skilled.primarySkills) ? skilled.primarySkills : [];
        const langs = Array.isArray(skilled.languagesSpoken) ? skilled.languagesSpoken : [];

        let avatar = skilled.profileImage || worker.profileImage || '';
        if (window.SLMedia && SLMedia.resolveUrl) {
                avatar = SLMedia.resolveUrl(avatar || '', skilled.cloudinaryId || worker.cloudinaryId || '');
        } else if (avatar && !/^https?:\/\//i.test(avatar)) {
                const baseUrl = API_BASE.replace('/api', '');
                avatar = baseUrl + (avatar.startsWith('/') ? '' : '/') + avatar;
        }

        const port = Array.isArray(skilled.portfolioSamples) ? skilled.portfolioSamples : [];
        function resUrl(u, cid) {
                let abs = u || '';
                if (window.SLMedia && SLMedia.resolveUrl) abs = SLMedia.resolveUrl(abs, cid || '');
                else if (abs && !/^https?:\/\//i.test(abs)) { const baseUrl = API_BASE.replace('/api',''); abs = baseUrl + (abs.startsWith('/') ? '' : '/') + abs; }
                return abs;
        }
        const certs = Array.isArray(skilled.certifications) ? skilled.certifications : [];

        const content = document.createElement('div');
        content.style.cssText = 'background:#fff; width:100%; max-width:720px; border-radius:12px; overflow:auto; max-height:85vh;';
        content.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid #eee;">
                <div style="display:flex; gap:12px; align-items:center;">
                    <div style="width:52px; height:52px; border-radius:50%; background:#e5e7eb; background-image:url('${avatar}'); background-size:cover; background-position:center;"></div>
                    <div>
                        <div style="font-weight:700; font-size:18px;">${fullName}</div>
                        <div style="color:#64748b; font-size:12px;">${title || ''}</div>
                    </div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button type="button" style="background:#f3f4f6; border:1px solid #e5e7eb; color:#111; padding:8px 12px; border-radius:8px; cursor:pointer;" onclick="closeProfileModal()">Close</button>
                    <button type="button" style="background: var(--color-green, #28a745); border:none; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer;" onclick="inviteWorker('${worker._id || worker.id || ''}')">Invite</button>
                </div>
            </div>
            <div style="padding:16px; display:grid; grid-template-columns:1fr; gap:16px;">
                <div style="display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:12px;">
                    <div><div style="font-size:12px; color:#64748b;">Email</div><div>${worker.email || ''}</div></div>
                    <div><div style="font-size:12px; color:#64748b;">Location</div><div>${location || ''}</div></div>
                    <div><div style="font-size:12px; color:#64748b;">Experience</div><div>${xp ? xp + ' years' : ''}</div></div>
                    <div><div style="font-size:12px; color:#64748b;">Hourly Rate</div><div>${rate !== '' ? rate + '/hour' : ''}</div></div>
                    <div><div style="font-size:12px; color:#64748b;">Availability</div><div>${skilled.availability || ''}</div></div>
                    <div><div style="font-size:12px; color:#64748b;">Languages</div><div>${langs.join(', ') || ''}</div></div>
                </div>
                ${bio ? `<div><div style="font-size:12px; color:#64748b;">Bio</div><div>${bio}</div></div>` : ''}
                ${skills.length ? `<div><div style="font-size:12px; color:#64748b;">Skills</div><div>${skills.map(s => `<span style='display:inline-block; padding:4px 8px; border:1px solid #e5e7eb; border-radius:999px; margin:2px; font-size:12px;'>${s}</span>`).join('')}</div></div>` : ''}
                <div>
                    <div style="font-weight:600; margin-bottom:8px;">Portfolio</div>
                    ${port.length ? `<div style="display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:10px;">${port.map(p => {
                        const url = resUrl(p && (p.url || p.fileUrl || ''), p && p.cloudinaryId);
                        const cap = (p && p.caption) || '';
                        return `<div style='border:1px solid #eee; border-radius:8px; overflow:hidden;'>
                                            <div style="aspect-ratio: 4 / 3; background:#f3f4f6; background-image:url('${url}'); background-size:cover; background-position:center;"></div>
                                            <div style='padding:6px 8px; font-size:12px;'>${cap}</div>
                                        </div>`;
                    }).join('')}</div>` : `<div style="color:#64748b;">No portfolio samples.</div>`}
                </div>
                <div>
                    <div style="font-weight:600; margin-bottom:8px;">Certifications</div>
                    ${certs.length ? `<ul style='margin:0; padding-left:18px;'>${certs.map(c => {
                        const u = resUrl(c && (c.fileUrl || c.url || ''), c && c.cloudinaryId);
                        const label = (c && c.label) || 'Certification';
                        return `<li style='margin:4px 0;'><a href='${u}' target='_blank' rel='noopener'>${label}</a></li>`;
                    }).join('')}</ul>` : `<div style="color:#64748b;">No certifications.</div>`}
                </div>
            </div>`;

        modal.innerHTML = '';
        modal.appendChild(content);
}

// Function to close profile modal
function closeProfileModal() {
    if (window.currentProfileModal) {
        document.body.removeChild(window.currentProfileModal);
        window.currentProfileModal = null;
    }
}

// Function to invite worker to job (opens modal to pick a job and message)
function inviteWorker(workerId) {
    if (!workerId) {
        showErrorMessage('Missing worker id');
        return;
    }
    // Require auth
    try {
        if (typeof getToken === 'function' && !getToken()) {
            showErrorMessage('Please sign in to invite a worker. Redirecting…');
            setTimeout(function(){ window.location.href = '../Sign-In/index.html'; }, 900);
            return;
        }
    } catch (_) {}

    openInviteModal(workerId);
}

// Build and show the invite modal
function openInviteModal(workerId) {
    // If already open, remove then recreate
    closeInviteModal();

    const overlay = document.createElement('div');
    overlay.className = 'invite-modal-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 20px; box-sizing: border-box;`;

    const modal = document.createElement('div');
    modal.className = 'invite-modal';
    modal.style.cssText = `
        background: #fff; width: 100%; max-width: 560px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); overflow: hidden; font-family: inherit;`;

    const header = document.createElement('div');
    header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding: 14px 16px; border-bottom: 1px solid #eee;';
    header.innerHTML = '<h3 style="margin:0; font-size:18px;">Invite Worker to a Job</h3>' +
        '<button type="button" aria-label="Close" style="background:none; border:none; font-size:18px; cursor:pointer;">×</button>';
    const closeBtn = header.querySelector('button');
    closeBtn.addEventListener('click', closeInviteModal);

    const body = document.createElement('div');
    body.style.cssText = 'padding: 14px 16px; max-height: 70vh; overflow:auto;';
    body.innerHTML = `
        <div id="invite-jobs-msg" class="msg" style="margin-bottom:8px; display:none;"></div>
        <label style="display:block; font-weight:600; margin: 6px 0;">Select a job</label>
        <div id="invite-jobs-list" style="border:1px solid #eee; border-radius:8px; padding:8px; max-height:240px; overflow:auto;">
            <p style="margin:8px 0; color:#666;">Loading your jobs…</p>
        </div>
        <label for="invite-message" style="display:block; font-weight:600; margin: 12px 0 6px;">Message</label>
        <textarea id="invite-message" rows="4" style="width:100%; box-sizing:border-box; padding:10px; border:1px solid #ddd; border-radius:8px; resize:vertical;">We would like to invite you.</textarea>
    `;

    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex; gap:8px; justify-content:flex-end; padding: 12px 16px; border-top: 1px solid #eee;';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.type = 'button';
    cancelBtn.style.cssText = 'background:#f5f5f5; border:1px solid #ddd; color:#333; padding:8px 12px; border-radius:8px; cursor:pointer;';
    cancelBtn.addEventListener('click', closeInviteModal);
    const sendBtn = document.createElement('button');
    sendBtn.textContent = 'Send Invite';
    sendBtn.type = 'button';
    sendBtn.style.cssText = 'background: var(--color-green, #28a745); border: none; color: #fff; padding:8px 12px; border-radius:8px; cursor:pointer;';
    sendBtn.addEventListener('click', function(){ submitInvite(workerId); });

    footer.appendChild(cancelBtn);
    footer.appendChild(sendBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Save for later
    window._inviteModal = overlay;

    // Load jobs
    loadEmployerJobsIntoModal();
}

function closeInviteModal() {
    if (window._inviteModal && window._inviteModal.parentNode) {
        window._inviteModal.parentNode.removeChild(window._inviteModal);
        window._inviteModal = null;
    }
}

function showInviteMsg(text, type) {
    const el = document.getElementById('invite-jobs-msg');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'msg ' + (type || 'info');
    el.style.display = text ? 'block' : 'none';
}

// Fetch current employer's jobs and render as radio list in modal
function loadEmployerJobsIntoModal() {
    const list = document.getElementById('invite-jobs-list');
    if (!list) return;

    // Use helper if present
    if (typeof callApi === 'function') {
        showInviteMsg('Loading your jobs…', 'info');
        callApi('/jobs', 'GET', null, true, function (err, data) {
            if (err) {
                showInviteMsg(err.message || 'Failed to load jobs', 'error');
                list.innerHTML = '<p style="color:#c00; margin:8px 0;">Unable to load your jobs.</p>';
                return;
            }
            showInviteMsg('', '');
            const jobs = (data && (data.jobs || data.items || data.data || [])) || [];
            renderJobsRadioList(list, jobs);
        });
        return;
    }

    // Fallback to direct fetch
    fetch(`${API_BASE}/jobs`, { method: 'GET', headers: buildHeaders() })
        .then(function (res) { if (!res.ok) throw new Error('Failed to load jobs'); return res.json(); })
        .then(function (data) {
            const jobs = (data && (data.jobs || data.items || data.data || [])) || [];
            renderJobsRadioList(list, jobs);
        })
        .catch(function (err) {
            console.error(err);
            list.innerHTML = '<p style="color:#c00; margin:8px 0;">Unable to load your jobs.</p>';
        });
}

function renderJobsRadioList(container, jobs) {
    container.innerHTML = '';
    if (!jobs || !jobs.length) {
        container.innerHTML = '<p style="margin:8px 0;">No jobs found. Please post a job first.</p>';
        return;
    }
    const group = document.createElement('div');
    group.setAttribute('role', 'radiogroup');
    jobs.forEach(function(job, idx){
        const id = 'job-radio-' + (job._id || job.id || idx);
        const item = document.createElement('label');
        item.htmlFor = id;
        item.style.cssText = 'display:flex; align-items:start; gap:10px; padding:8px; border:1px solid #eee; border-radius:8px; margin:6px 0; cursor:pointer;';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'invite-job-id';
        input.id = id;
        input.value = job._id || job.id || '';
        input.style.marginTop = '4px';
        const info = document.createElement('div');
        info.innerHTML = '<div style="font-weight:600;">' + (job.title || 'Untitled') + '</div>' +
            '<div style="color:#666; font-size:12px;">Budget: N' + (job.budgetRange?.min ?? '') + ' - N' + (job.budgetRange?.max ?? '') + (job.timeline ? ' • ' + String(job.timeline).slice(0,10) : '') + '</div>' +
            (job.description ? '<div style="color:#555; font-size:12px; margin-top:4px;">' + job.description.slice(0, 120) + (job.description.length > 120 ? '…' : '') + '</div>' : '');
        item.appendChild(input);
        item.appendChild(info);
        group.appendChild(item);
        if (idx === 0) input.checked = true;
    });
    container.appendChild(group);
}

function submitInvite(workerId) {
    const selected = document.querySelector('input[name="invite-job-id"]:checked');
    const messageEl = document.getElementById('invite-message');
    const jobId = selected ? selected.value : '';
    const message = messageEl ? messageEl.value.trim() : '';

    if (!jobId) { showInviteMsg('Please select a job.', 'error'); return; }
    if (!message) { showInviteMsg('Please enter a message.', 'error'); return; }

    showInviteMsg('Sending invite…', 'info');

    const payload = { jobId: jobId, workerId: workerId, message: message };

    // Use helper if available
    if (typeof callApi === 'function') {
        callApi('/invites', 'POST', payload, true, function (err, data) {
            if (err) { showInviteMsg(err.message || 'Failed to send invite', 'error'); return; }
            closeInviteModal();
            showSuccessMessage('Invitation sent successfully.');
        });
        return;
    }

    fetch(`${API_BASE}/invites`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify(payload)
    })
    .then(function(res){ if (!res.ok) throw new Error('Failed to send invite'); return res.json(); })
    .then(function(){
        closeInviteModal();
        showSuccessMessage('Invitation sent successfully.');
    })
    .catch(function(err){
        console.error(err);
        showInviteMsg('Failed to send invite', 'error');
    });
}

// Function to show success message
function showSuccessMessage(message) {
    // Create a better success message display
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.innerHTML = `<strong>Success!</strong> ${message}`;
    
    // Insert at the top of talent section
    const talentSection = document.querySelector('#talent .content-page-details');
    if (talentSection) {
        talentSection.insertBefore(successDiv, talentSection.firstChild);
        
        // Remove after 5 seconds
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.parentNode.removeChild(successDiv);
            }
        }, 5000);
    } else {
        // Fallback to alert
        alert('Success: ' + message);
    }
}

// Function to show error message
function showErrorMessage(message) {
    // Create a better error message display
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `<strong>Error!</strong> ${message}`;
    
    // Insert at the top of talent section
    const talentSection = document.querySelector('#talent .content-page-details');
    if (talentSection) {
        talentSection.insertBefore(errorDiv, talentSection.firstChild);
        
        // Remove after 8 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 8000);
    } else {
        // Fallback to alert
        alert('Error: ' + message);
    }
}

// Function to show loading state
function showLoading() {
        const talentContainer = document.querySelector('.talent-cont');
        if (talentContainer) {
                const skeletons = Array.from({ length: 6 }).map(() => `
                    <div class="talent-cards talent-skel">
                        <div class="talent-header">
                            <p class="talent-prof" style="background:#e5e7eb"></p>
                            <div class="talent-info" style="flex:1">
                                <div class="skl-line" style="height:14px; width:60%; background:#eee; border-radius:6px; margin:6px 0;"></div>
                                <div class="skl-line" style="height:12px; width:40%; background:#f2f2f2; border-radius:6px;"></div>
                            </div>
                        </div>
                        <p class="talent-charge"><span class="skl-line" style="display:inline-block; height:14px; width:80px; background:#eee; border-radius:6px;"></span></p>
                        <p class="talent-details"><span class="skl-line" style="display:block; height:12px; width:100%; background:#f2f2f2; border-radius:6px; margin:4px 0;"></span><span class="skl-line" style="display:block; height:12px; width:90%; background:#f2f2f2; border-radius:6px; margin:4px 0;"></span><span class="skl-line" style="display:block; height:12px; width:70%; background:#f2f2f2; border-radius:6px; margin:4px 0;"></span></p>
                        <div class="talent-button">
                            <span class="skl-line" style="display:inline-block; height:32px; width:40%; background:#eee; border-radius:8px;"></span>
                            <span class="skl-line" style="display:inline-block; height:32px; width:40%; background:#eee; border-radius:8px;"></span>
                        </div>
                    </div>`).join('');
                talentContainer.innerHTML = skeletons;
        }
}

// Function to hide loading state
function hideLoading() {
    // Loading will be hidden when displayWorkers is called
}

// Function to show no results message
function showNoResultsMessage(searchText) {
    const talentContainer = document.querySelector('.talent-cont');
    if (talentContainer) {
        talentContainer.innerHTML = `
            <div class="no-results" style="text-align: center; padding: 40px; color: var(--gray);">
                <h3>No workers found</h3>
                <p>No workers found for "${searchText}". Try different search terms.</p>
                <button onclick="getAllWorkers()" style="margin-top: 15px; padding: 10px 20px; background: var(--color-green); color: white; border: none; border-radius: 5px; cursor: pointer;">
                    Show All Workers
                </button>
            </div>
        `;
    }
}

// Function to update pagination
function updatePagination() {
    const paginationContainer = document.querySelector('.cat-pagination .pag-cen');
    if (!paginationContainer) return;
    
    paginationContainer.innerHTML = '';
    
    for (let i = 1; i <= Math.min(totalPages, 4); i++) {
        const pageItem = document.createElement('div');
        pageItem.className = `pagin-item pagin-item${i+1}`;
        pageItem.textContent = i;
        pageItem.onclick = () => loadPage(i);
        if (i === currentPage) {
            pageItem.style.backgroundColor = '#007bff';
            pageItem.style.color = 'white';
        }
        paginationContainer.appendChild(pageItem);
    }
}

// Function to load specific page
function loadPage(page) {
    currentPage = page;
    fetchWorkers({ ...currentFilters, page });
}

// Function to setup search functionality
function setupSearch() {
    const searchInput = document.querySelector('#talent-search');
    const searchIcon = document.querySelector('.talent-icon');
    
    if (searchInput) {
        const debouncedSearch = debounce(() => {
            const val = searchInput.value.trim();
            if (val.length > 1 || val.length === 0) {
                searchWorkers();
            }
        }, 400);

        // Search when user presses Enter
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchWorkers();
            }
        });

        // Debounced input search
        searchInput.addEventListener('input', debouncedSearch);
    }
    
    if (searchIcon) {
        // Search when user clicks search icon (also debounced to avoid rapid double calls)
        const debouncedClick = debounce(() => searchWorkers(), 200);
        searchIcon.addEventListener('click', debouncedClick);
        searchIcon.style.cursor = 'pointer';
    }
}

// Function to setup filter functionality (simple version)
function setupFilters() {
    const rateSlider = document.querySelector('.input-rate input[type="range"]');
    
    if (rateSlider) {
        rateSlider.addEventListener('change', function() {
            const maxRate = this.value;
            // Update filters and refetch from API so pagination stays correct
            fetchWorkers({ ...currentFilters, maxRate, page: 1 });
        });
    }
}

// Function to filter workers by hourly rate
function filterWorkersByRate(maxRate) {
    const filteredWorkers = allWorkers.filter(worker => {
        const workerRate = worker.skilledWorker?.hourlyRate || 0;
        return workerRate <= maxRate;
    });
    
    displayWorkers(filteredWorkers);
}

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('Talent management page loaded');
    console.log('API Base URL:', API_BASE);
    
    // Setup search and filters
    setupSearch();
    setupFilters();
    
    // Load initial workers data when on talent tab
    const talentTab = document.getElementById('tab-talent');
    if (talentTab) {
        talentTab.addEventListener('change', function() {
            if (this.checked) {
                console.log('Talent tab selected, loading workers...');
                getAllWorkers();
            }
        });
        
        // If talent tab is already checked, load workers
        if (talentTab.checked) {
            console.log('Talent tab already active, loading workers...');
            getAllWorkers();
        }
    }
    
    // Also try to load workers after a short delay to ensure DOM is ready
    setTimeout(() => {
        const talentTab = document.getElementById('tab-talent');
        if (talentTab && talentTab.checked) {
            console.log('Loading workers after delay...');
            getAllWorkers();
        }
    }, 500);
});

// Export functions for global access (if needed)
window.getAllWorkers = getAllWorkers;
window.searchWorkers = searchWorkers;
window.viewWorkerProfile = viewWorkerProfile;
window.inviteWorker = inviteWorker;
window.closeProfileModal = closeProfileModal;

// Simple function to manually load and display workers (for testing)
window.loadWorkersNow = function() {
    console.log('Manually loading workers...');
    getAllWorkers();
};

// Test function to verify API connectivity
window.testTalentAPI = function() {
    console.log('Testing Talent Management API...');
    console.log('API Base URL:', API_BASE);
    console.log('Auth Token:', getApiToken().substring(0, 20) + '...');
    
    // Simple test call
    fetch(`${API_BASE}/workers/public`, {
        method: 'GET',
        headers: {
            'Authorization': getApiToken(),
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        console.log('API Response Status:', response.status);
        if (response.ok) {
            console.log('✅ API connection successful!');
            return response.json();
        } else {
            console.log('❌ API connection failed!');
            throw new Error(`HTTP ${response.status}`);
        }
    })
    .then(data => {
        console.log('✅ Data received:', data);
        console.log(`Found ${data.items?.length || 0} workers`);
        
        // Automatically display the workers if talent container exists
        if (data.items && data.items.length > 0) {
            const talentContainer = document.querySelector('.talent-cont');
            if (talentContainer) {
                console.log('Displaying workers from test...');
                displayWorkers(data.items);
            }
        }
    })
    .catch(error => {
        console.error('❌ API Test Failed:', error);
        console.log('Make sure:');
        console.log('1. API server is running');
        console.log('2. CORS is enabled on the server');
        console.log('3. Authentication token is valid');
    });
};
