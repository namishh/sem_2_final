const State = {
  user: null,
  teams: [],
  currentTeamId: null,
  currentView: 'all', 
  filters: {} 
};
const PRIORITIES = [
  { key: 'urgent', label: 'Urgent', icon: 'alert-circle' },
  { key: 'high', label: 'High', icon: 'arrow-up-circle' },
  { key: 'medium', label: 'Medium', icon: 'minus-circle' },
  { key: 'low', label: 'Low', icon: 'arrow-down-circle' },
  { key: 'none', label: 'No priority', icon: 'circle-dashed' }
];
const PRIORITY_MAP = Object.fromEntries(PRIORITIES.map((p) => [p.key, p]));
const STATUSES = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'todo', label: 'Todo' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'in_review', label: 'In Review' },
  { key: 'done', label: 'Done' },
  { key: 'cancelled', label: 'Cancelled' }
];
const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.key, s]));
function authFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  });
}
async function api(url, options) {
  const res = await authFetch(url, options);
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    const msg = (data && data.error) || `Request failed (${res.status})`;
    if (res.status === 401) { logout(); }
    throw new Error(msg);
  }
  return data;
}
function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
function escapeHtml(str) {
  return (str ?? '').toString().replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function initials(name) {
  return (name || '?').split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}
function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''} ago`;
  return `${Math.floor(months / 12)} year(s) ago`;
}
let toastTimer;
function toast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2600);
}
function priorityIconHtml(key, size = 16) {
  const p = PRIORITY_MAP[key] || PRIORITY_MAP.none;
  return `<span class="priority-icon ${p.key}" data-lucide="${p.icon}" style="width:${size}px;height:${size}px;" title="${p.label}"></span>`;
}
function openModal(contentNode) {
  const modal = document.getElementById('modal');
  modal.innerHTML = '';
  modal.appendChild(contentNode);
  document.getElementById('modal-overlay').classList.add('open');
  refreshIcons();
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}
function openPanel(contentNode) {
  const panel = document.getElementById('slide-panel');
  panel.innerHTML = '';
  panel.appendChild(contentNode);
  panel.classList.add('open');
  document.getElementById('panel-overlay').classList.add('open');
  refreshIcons();
}
function closePanel() {
  document.getElementById('slide-panel').classList.remove('open');
  document.getElementById('panel-overlay').classList.remove('open');
}
function setBodyMode(mode) {
  document.body.className = mode; // 'auth' or 'app'
}
function logout() {
  localStorage.removeItem('token');
  State.user = null;
  State.teams = [];
  State.currentTeamId = null;
  setBodyMode('auth');
}
async function loadAppData() {
  State.user = await api('/api/auth/me');
  State.teams = await api('/api/teams');
  if (State.teams.length && !State.currentTeamId) {
    State.currentTeamId = State.teams[0].id;
  }
}
function currentTeam() {
  return State.teams.find((t) => t.id === State.currentTeamId) || null;
}
async function bootApp() {
  await loadAppData();
  setBodyMode('app');
  renderSidebar();
  renderIssuesView();
  refreshIcons();
}
function initAuthForm() {
  let mode = 'login';
  const tabs = document.querySelectorAll('.auth-tab');
  const nameField = document.getElementById('name-field');
  const submitBtn = document.getElementById('auth-submit');
  const errBox = document.getElementById('auth-error');
  const pwInput = document.getElementById('auth-password');
  function setMode(m) {
    mode = m;
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.mode === m));
    nameField.style.display = m === 'register' ? 'block' : 'none';
    submitBtn.textContent = m === 'register' ? 'Create account' : 'Log in';
    pwInput.setAttribute('autocomplete', m === 'register' ? 'new-password' : 'current-password');
    errBox.textContent = '';
  }
  tabs.forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));
  document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.textContent = '';
    const name = document.getElementById('auth-name').value.trim();
    const email = document.getElementById('auth-email').value.trim();
    const password = pwInput.value;
    const url = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
    const payload = mode === 'register' ? { name, email, password } : { email, password };
    submitBtn.disabled = true;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');
      localStorage.setItem('token', data.token);
      await bootApp();
    } catch (err) {
      errBox.textContent = err.message;
    } finally {
      submitBtn.disabled = false;
    }
  });
}
document.addEventListener('DOMContentLoaded', async () => {
  initAuthForm();
  document.getElementById('panel-overlay').addEventListener('click', closePanel);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePanel(); closeModal(); }
  });
  const token = localStorage.getItem('token');
  if (token) {
    try {
      await bootApp();
    } catch (_) {
      logout();
    }
  } else {
    setBodyMode('auth');
  }
  refreshIcons();
});
