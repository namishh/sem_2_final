async function renderIssuesView() {
  const team = currentTeam();
  const header = document.getElementById('content-header');
  const body = document.getElementById('content-body');
  if (!team) {
    header.innerHTML = '<h1>No team</h1>';
    body.innerHTML = `
      <div class="empty-state">
        <span data-lucide="folder-plus"></span>
        <div>You're not part of any team yet.</div>
        <button class="btn btn-primary" onclick="openNewTeamModal()">Create a team</button>
      </div>`;
    refreshIcons();
    return;
  }
  const viewTitles = { all: 'All Issues', my: 'My Issues', backlog: 'Backlog' };
  const title = viewTitles[State.currentView] || 'Issues';
  header.innerHTML = `
    <h1><span class="team-badge" style="background:var(--accent);">${escapeHtml(team.identifier)}</span> ${title}</h1>
    <div class="spacer"></div>
    <button class="btn btn-primary" data-new-issue><span data-lucide="plus"></span>New issue</button>
  `;
  header.querySelector('[data-new-issue]').addEventListener('click', () => openCreatePanel());
  body.innerHTML = `<div id="filter-bar"></div><div id="issue-list" class="issue-list"></div>`;
  await renderFilterBar(team);
  await loadAndRenderIssues(team);
  refreshIcons();
}
async function renderFilterBar(team) {
  const bar = document.getElementById('filter-bar');
  bar.className = 'filter-bar';
  let labels = [];
  try { labels = await api(`/api/teams/${team.id}/labels`); } catch (_) {}
  const members = team.members || [];
  const dropdowns = [
    {
      key: 'priority', label: 'Priority',
      options: PRIORITIES.map((p) => ({ value: p.key, label: p.label, icon: p.icon }))
    },
    {
      key: 'status', label: 'Status',
      options: STATUSES.map((s) => ({ value: s.key, label: s.label }))
    },
    {
      key: 'labelId', label: 'Label',
      options: labels.map((l) => ({ value: String(l.id), label: l.name, color: l.color }))
    },
    {
      key: 'assignee', label: 'Assignee',
      options: [
        { value: 'me', label: 'Me' },
        { value: 'unassigned', label: 'Unassigned' },
        ...members.map((m) => ({ value: String(m.id), label: m.name }))
      ]
    }
  ];
  bar.innerHTML = dropdowns.map((d) => `
    <div class="filter-dd" data-dd="${d.key}">
      <button class="filter-btn"><span data-lucide="plus"></span>${d.label}</button>
      <div class="dd-menu">
        ${d.options.map((o) => `
          <div class="dd-opt" data-key="${d.key}" data-value="${escapeHtml(o.value)}">
            ${o.icon ? `<span data-lucide="${o.icon}"></span>` : ''}
            ${o.color ? `<span class="dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${o.color}"></span>` : ''}
            ${escapeHtml(o.label)}
          </div>`).join('')}
      </div>
    </div>
  `).join('') + `<div class="active-chips" id="active-chips"></div>`;
  bar.querySelectorAll('.filter-dd .filter-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = btn.nextElementSibling;
      const isOpen = menu.classList.contains('open');
      document.querySelectorAll('.dd-menu').forEach((m) => m.classList.remove('open'));
      if (!isOpen) menu.classList.add('open');
    });
  });
  bar.querySelectorAll('.dd-opt').forEach((opt) => {
    opt.addEventListener('click', () => {
      State.filters[opt.dataset.key] = opt.dataset.value;
      document.querySelectorAll('.dd-menu').forEach((m) => m.classList.remove('open'));
      renderActiveChips(team, labels);
      loadAndRenderIssues(team);
    });
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.dd-menu').forEach((m) => m.classList.remove('open'));
  });
  renderActiveChips(team, labels);
  refreshIcons();
}
function filterDisplay(key, value, labels, members) {
  if (key === 'priority') return 'Priority: ' + (PRIORITY_MAP[value]?.label || value);
  if (key === 'status') return 'Status: ' + (STATUS_MAP[value]?.label || value);
  if (key === 'labelId') return 'Label: ' + (labels.find((l) => String(l.id) === value)?.name || value);
  if (key === 'assignee') {
    if (value === 'me') return 'Assignee: Me';
    if (value === 'unassigned') return 'Assignee: Unassigned';
    return 'Assignee: ' + (members.find((m) => String(m.id) === value)?.name || value);
  }
  return `${key}: ${value}`;
}
function renderActiveChips(team, labels) {
  const wrap = document.getElementById('active-chips');
  const members = team.members || [];
  const keys = Object.keys(State.filters);
  if (!keys.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = keys.map((k) => `
    <span class="chip">
      ${escapeHtml(filterDisplay(k, State.filters[k], labels, members))}
      <span class="x" data-clear="${k}"><span data-lucide="x"></span></span>
    </span>`).join('') + `<button class="btn btn-sm btn-ghost" data-clear-all>Clear all</button>`;
  wrap.querySelectorAll('[data-clear]').forEach((x) => {
    x.addEventListener('click', () => {
      delete State.filters[x.dataset.clear];
      renderActiveChips(team, labels);
      loadAndRenderIssues(team);
    });
  });
  wrap.querySelector('[data-clear-all]').addEventListener('click', () => {
    State.filters = {};
    renderActiveChips(team, labels);
    loadAndRenderIssues(team);
  });
  refreshIcons();
}
function buildQuery(team) {
  const params = new URLSearchParams();
  const f = { ...State.filters };
  if (State.currentView === 'my') f.assignee = 'me';
  if (State.currentView === 'backlog') f.status = 'backlog';
  for (const [k, v] of Object.entries(f)) params.set(k, v);
  const qs = params.toString();
  return `/api/teams/${team.id}/issues${qs ? '?' + qs : ''}`;
}
async function loadAndRenderIssues(team) {
  const list = document.getElementById('issue-list');
  let issues = [];
  try { issues = await api(buildQuery(team)); } catch (err) { toast(err.message, true); return; }
  if (!issues.length) {
    list.innerHTML = `
      <div class="empty-state">
        <span data-lucide="check-circle-2"></span>
        <div>No issues found. Create one to get started.</div>
      </div>`;
    refreshIcons();
    return;
  }
  const groups = {};
  for (const i of issues) (groups[i.status] = groups[i.status] || []).push(i);
  list.innerHTML = STATUSES.filter((s) => groups[s.key])
    .map((s) => {
      const rows = groups[s.key].map((i) => issueRowHtml(i)).join('');
      return `
        <div class="issue-group-header">
          <span class="status-dot status-${s.key}"></span>${s.label}
          <span class="count">${groups[s.key].length}</span>
        </div>${rows}`;
    }).join('');
  list.querySelectorAll('.issue-row').forEach((row) => {
    row.addEventListener('click', () => openIssuePanel(Number(row.dataset.id)));
  });
  refreshIcons();
}
function issueRowHtml(i) {
  const labels = (i.labels || []).map((l) => `
    <span class="label-pill" style="background:${l.color}22; color:${l.color};">
      <span class="dot" style="background:${l.color}"></span>${escapeHtml(l.name)}
    </span>`).join('');
  const assignee = i.assignee
    ? `<span class="avatar" title="${escapeHtml(i.assignee.name)}">${i.assignee.initials}</span>`
    : '';
  return `
    <div class="issue-row" data-id="${i.id}">
      ${priorityIconHtml(i.priority)}
      <span class="key">${escapeHtml(i.key)}</span>
      <span class="title">${escapeHtml(i.title)}</span>
      <span class="labels">${labels}</span>
      ${assignee}
    </div>`;
}
async function openCreatePanel() {
  const team = currentTeam();
  let labels = [];
  try { labels = await api(`/api/teams/${team.id}/labels`); } catch (_) {}
  const selectedLabels = new Set();
  let priority = 'none';
  const node = el(`
    <div style="display:flex;flex-direction:column;height:100%;">
      <div class="panel-head">
        <span class="key">New issue · ${escapeHtml(team.identifier)}</span>
        <div class="spacer"></div>
        <button class="icon-btn" data-close style="color:var(--text-muted);"><span data-lucide="x"></span></button>
      </div>
      <div class="panel-body">
        <input class="panel-title-input" id="ci-title" placeholder="Issue title" />
        <textarea class="panel-desc" id="ci-desc" placeholder="Add a description…"></textarea>
        <div class="prop-row">
          <div class="prop-label">Priority</div>
          <div class="prop-value">
            <div class="prio-picker" id="ci-prio">
              ${PRIORITIES.map((p) => `
                <button class="prio-opt ${p.key === 'none' ? 'active' : ''}" data-prio="${p.key}">
                  ${priorityIconHtml(p.key, 14)}${p.label}
                </button>`).join('')}
            </div>
          </div>
        </div>
        <div class="prop-row">
          <div class="prop-label">Labels</div>
          <div class="prop-value" id="ci-labels">
            ${labels.map((l) => `
              <button class="label-picker-toggle" data-label="${l.id}" data-color="${l.color}" data-name="${escapeHtml(l.name)}">
                <span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${l.color}"></span>${escapeHtml(l.name)}
              </button>`).join('') || '<span class="muted">No labels</span>'}
          </div>
        </div>
      </div>
      <div style="padding:14px 18px; border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:8px;">
        <button class="btn" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-create>Create issue</button>
      </div>
    </div>
  `);
  node.querySelector('[data-close]').addEventListener('click', closePanel);
  node.querySelector('[data-cancel]').addEventListener('click', closePanel);
  node.querySelectorAll('#ci-prio .prio-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      priority = btn.dataset.prio;
      node.querySelectorAll('#ci-prio .prio-opt').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });
  node.querySelectorAll('#ci-labels [data-label]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.label);
      if (selectedLabels.has(id)) {
        selectedLabels.delete(id);
        btn.style.background = '';
        btn.style.borderStyle = 'dashed';
      } else {
        selectedLabels.add(id);
        btn.style.background = btn.dataset.color + '22';
        btn.style.borderStyle = 'solid';
        btn.style.borderColor = btn.dataset.color;
      }
    });
  });
  node.querySelector('[data-create]').addEventListener('click', async () => {
    const titleVal = node.querySelector('#ci-title').value.trim();
    if (!titleVal) { toast('Title is required', true); return; }
    try {
      await api(`/api/teams/${team.id}/issues`, {
        method: 'POST',
        body: JSON.stringify({
          title: titleVal,
          description: node.querySelector('#ci-desc').value,
          priority,
          labelIds: [...selectedLabels]
        })
      });
      closePanel();
      renderIssuesView();
      toast('Issue created');
    } catch (err) { toast(err.message, true); }
  });
  openPanel(node);
  setTimeout(() => node.querySelector('#ci-title').focus(), 60);
}
async function openIssuePanel(issueId) {
  const team = currentTeam();
  let issue, labels = [], members = team.members || [];
  try {
    issue = await api(`/api/issues/${issueId}`);
    labels = await api(`/api/teams/${team.id}/labels`);
  } catch (err) { toast(err.message, true); return; }
  const node = el(`
    <div style="display:flex;flex-direction:column;height:100%;">
      <div class="panel-head">
        ${priorityIconHtml(issue.priority)}
        <span class="key">${escapeHtml(issue.key)}</span>
        <div class="spacer"></div>
        <button class="icon-btn" data-del title="Delete issue" style="color:var(--danger);"><span data-lucide="trash-2"></span></button>
        <button class="icon-btn" data-close style="color:var(--text-muted);"><span data-lucide="x"></span></button>
      </div>
      <div class="panel-body">
        <textarea class="panel-title-input" id="d-title" rows="1">${escapeHtml(issue.title)}</textarea>
        <textarea class="panel-desc" id="d-desc" placeholder="Add a description…">${escapeHtml(issue.description || '')}</textarea>
        <div class="prop-row">
          <div class="prop-label">Status</div>
          <div class="prop-value">
            <select class="status-picker" id="d-status">
              ${STATUSES.map((s) => `<option value="${s.key}" ${s.key === issue.status ? 'selected' : ''}>${s.label}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="prop-row">
          <div class="prop-label">Priority</div>
          <div class="prop-value">
            <div class="prio-picker" id="d-prio">
              ${PRIORITIES.map((p) => `
                <button class="prio-opt ${p.key === issue.priority ? 'active' : ''}" data-prio="${p.key}">
                  ${priorityIconHtml(p.key, 14)}${p.label}
                </button>`).join('')}
            </div>
          </div>
        </div>
        <div class="prop-row">
          <div class="prop-label">Assignee</div>
          <div class="prop-value">
            <select class="assignee-picker" id="d-assignee">
              <option value="">Unassigned</option>
              ${members.map((m) => `<option value="${m.id}" ${issue.assignee_id === m.id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="prop-row">
          <div class="prop-label">Labels</div>
          <div class="prop-value" id="d-labels"></div>
        </div>
        <div class="comments-section">
          <h3>Quick notes</h3>
          <div id="d-comments"></div>
          <div class="comment-form">
            <textarea id="d-comment-input" placeholder="Leave a note…"></textarea>
            <div class="row"><button class="btn btn-primary btn-sm" data-add-comment>Add note</button></div>
          </div>
        </div>
      </div>
    </div>
  `);
  node.querySelector('[data-close]').addEventListener('click', closePanel);
  const titleEl = node.querySelector('#d-title');
  const descEl = node.querySelector('#d-desc');
  async function patch(payload) {
    try {
      const updated = await api(`/api/issues/${issue.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      issue = { ...issue, ...updated };
    } catch (err) { toast(err.message, true); }
  }
  titleEl.addEventListener('blur', () => {
    const v = titleEl.value.trim();
    if (v && v !== issue.title) patch({ title: v }).then(() => { renderIssuesViewSilent(); });
  });
  descEl.addEventListener('blur', () => {
    if (descEl.value !== (issue.description || '')) patch({ description: descEl.value });
  });
  node.querySelector('#d-status').addEventListener('change', async (e) => {
    await patch({ status: e.target.value });
    renderIssuesViewSilent();
  });
  node.querySelectorAll('#d-prio .prio-opt').forEach((btn) => {
    btn.addEventListener('click', async () => {
      node.querySelectorAll('#d-prio .prio-opt').forEach((b) => b.classList.toggle('active', b === btn));
      await patch({ priority: btn.dataset.prio });
      const head = node.querySelector('.panel-head .priority-icon');
      if (head) { node.querySelector('.panel-head').replaceChild(el(priorityIconHtml(btn.dataset.prio)), head); refreshIcons(); }
      renderIssuesViewSilent();
    });
  });
  node.querySelector('#d-assignee').addEventListener('change', async (e) => {
    await patch({ assigneeId: e.target.value ? Number(e.target.value) : null });
    renderIssuesViewSilent();
  });
  function renderLabels() {
    const wrap = node.querySelector('#d-labels');
    const assigned = issue.labels || [];
    const assignedIds = new Set(assigned.map((l) => l.id));
    const available = labels.filter((l) => !assignedIds.has(l.id));
    wrap.innerHTML = assigned.map((l) => `
      <span class="label-pill" style="background:${l.color}22; color:${l.color};">
        <span class="dot" style="background:${l.color}"></span>${escapeHtml(l.name)}
        <span class="rm" data-rm-label="${l.id}"><span data-lucide="x"></span></span>
      </span>`).join('') + `
      <div class="filter-dd" style="display:inline-block;">
        <button class="label-picker-toggle" data-label-add><span data-lucide="plus"></span>Add label</button>
        <div class="dd-menu">
          ${available.length ? available.map((l) => `
            <div class="dd-opt" data-add-label="${l.id}">
              <span class="dot" style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${l.color}"></span>${escapeHtml(l.name)}
            </div>`).join('') : '<div class="dd-opt muted">All labels added</div>'}
        </div>
      </div>`;
    wrap.querySelector('[data-label-add]').addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = e.currentTarget.nextElementSibling;
      const open = menu.classList.contains('open');
      document.querySelectorAll('.dd-menu').forEach((m) => m.classList.remove('open'));
      if (!open) menu.classList.add('open');
    });
    wrap.querySelectorAll('[data-add-label]').forEach((opt) => {
      opt.addEventListener('click', async () => {
        try {
          issue = await api(`/api/issues/${issue.id}/labels`, { method: 'POST', body: JSON.stringify({ labelId: Number(opt.dataset.addLabel) }) });
          renderLabels(); renderIssuesViewSilent();
        } catch (err) { toast(err.message, true); }
      });
    });
    wrap.querySelectorAll('[data-rm-label]').forEach((x) => {
      x.addEventListener('click', async () => {
        try {
          issue = await api(`/api/issues/${issue.id}/labels/${x.dataset.rmLabel}`, { method: 'DELETE' });
          renderLabels(); renderIssuesViewSilent();
        } catch (err) { toast(err.message, true); }
      });
    });
    refreshIcons();
  }
  renderLabels();
  function renderComments() {
    const wrap = node.querySelector('#d-comments');
    const comments = issue.comments || [];
    wrap.innerHTML = comments.length
      ? comments.map((c) => `
        <div class="comment">
          <span class="avatar">${c.author_initials || '?'}</span>
          <div class="body-wrap">
            <div class="meta"><span class="name">${escapeHtml(c.author_name || 'Unknown')}</span><span class="time">${timeAgo(c.created_at)}</span></div>
            <div class="text">${escapeHtml(c.body)}</div>
          </div>
        </div>`).join('')
      : '<div class="muted" style="font-size:13px; margin-bottom:8px;">No notes yet.</div>';
  }
  renderComments();
  node.querySelector('[data-add-comment]').addEventListener('click', async () => {
    const input = node.querySelector('#d-comment-input');
    const body = input.value.trim();
    if (!body) return;
    try {
      const c = await api(`/api/issues/${issue.id}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
      issue.comments = [...(issue.comments || []), c];
      input.value = '';
      renderComments();
    } catch (err) { toast(err.message, true); }
  });
  node.querySelector('[data-del]').addEventListener('click', async () => {
    if (!confirm('Delete this issue permanently?')) return;
    try {
      await api(`/api/issues/${issue.id}`, { method: 'DELETE' });
      closePanel();
      renderIssuesView();
      toast('Issue deleted');
    } catch (err) { toast(err.message, true); }
  });
  openPanel(node);
}
async function renderIssuesViewSilent() {
  const team = currentTeam();
  if (!team || State.currentView === 'members') return;
  try { await loadAndRenderIssues(team); } catch (_) {}
}
