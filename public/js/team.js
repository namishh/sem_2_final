function openNewTeamModal() {
  const node = el(`
    <div>
      <h2>Create a team</h2>
      <p class="sub">Teams group your issues, labels, and members together.</p>
      <div class="field">
        <label>Team name</label>
        <input type="text" id="new-team-name" placeholder="Engineering" />
      </div>
      <div class="auth-error" id="new-team-err"></div>
      <div class="modal-actions">
        <button class="btn" data-cancel>Cancel</button>
        <button class="btn btn-primary" data-create>Create team</button>
      </div>
    </div>
  `);
  node.querySelector('[data-cancel]').addEventListener('click', closeModal);
  node.querySelector('[data-create]').addEventListener('click', async () => {
    const name = node.querySelector('#new-team-name').value.trim();
    if (!name) return;
    try {
      const team = await api('/api/teams', { method: 'POST', body: JSON.stringify({ name }) });
      State.teams = await api('/api/teams');
      State.currentTeamId = team.id;
      State.currentView = 'all';
      closeModal();
      renderSidebar();
      renderIssuesView();
      toast('Team created');
    } catch (err) {
      node.querySelector('#new-team-err').textContent = err.message;
    }
  });
  openModal(node);
  setTimeout(() => node.querySelector('#new-team-name').focus(), 50);
}
async function openSettings() {
  const team = currentTeam();
  const node = el(`
    <div>
      <h2>Settings</h2>
      <p class="sub">Manage your account and the current team.</p>
      <div class="field">
        <label>Account</label>
        <div class="member-row">
          <span class="avatar lg">${initials(State.user.name)}</span>
          <div class="info">
            <div class="n">${escapeHtml(State.user.name)}</div>
            <div class="e">${escapeHtml(State.user.email)}</div>
          </div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="field">
        <label>Team labels — ${escapeHtml(team ? team.name : '')}</label>
        <div id="labels-mgr"></div>
        <div style="display:flex; gap:6px; margin-top:8px;">
          <input type="text" id="new-label-name" placeholder="Label name" style="flex:1; padding:7px 10px; border:1px solid var(--border); border-radius:7px;" />
          <input type="color" id="new-label-color" value="#6366f1" style="width:40px; height:34px; border:1px solid var(--border); border-radius:7px; padding:2px;" />
          <button class="btn btn-sm" data-add-label>Add</button>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" data-cancel>Close</button>
        <button class="btn btn-danger" data-del-account>Delete Account</button>
      </div>
    </div>
  `);
  node.querySelector('[data-cancel]').addEventListener('click', closeModal);
  node.querySelector('[data-del-account]').addEventListener('click', () => { closeModal(); openDeleteAccountModal(); });
  async function loadLabels() {
    const labels = await api(`/api/teams/${team.id}/labels`);
    const mgr = node.querySelector('#labels-mgr');
    mgr.innerHTML = labels.length
      ? labels.map((l) => `
          <div class="label-mgr-row">
            <span class="swatch" style="background:${l.color}"></span>
            <span style="flex:1;">${escapeHtml(l.name)}</span>
          </div>`).join('')
      : '<div class="muted" style="font-size:13px;">No labels yet.</div>';
  }
  node.querySelector('[data-add-label]').addEventListener('click', async () => {
    const name = node.querySelector('#new-label-name').value.trim();
    const color = node.querySelector('#new-label-color').value;
    if (!name) return;
    try {
      await api(`/api/teams/${team.id}/labels`, { method: 'POST', body: JSON.stringify({ name, color }) });
      node.querySelector('#new-label-name').value = '';
      await loadLabels();
      toast('Label added');
    } catch (err) { toast(err.message, true); }
  });
  openModal(node);
  if (team) loadLabels();
}
function openDeleteAccountModal() {
  const email = State.user.email;
  const node = el(`
    <div>
      <h2 style="color:var(--danger);">Delete account</h2>
      <p class="sub">This permanently deletes your account and all teams you own, including their issues and comments. This cannot be undone.</p>
      <div class="field">
        <label>Type <b>${escapeHtml(email)}</b> to confirm</label>
        <input type="text" id="confirm-email" placeholder="${escapeHtml(email)}" />
      </div>
      <div class="modal-actions">
        <button class="btn" data-cancel>Cancel</button>
        <button class="btn btn-danger" data-confirm disabled>Delete my account</button>
      </div>
    </div>
  `);
  const input = node.querySelector('#confirm-email');
  const confirmBtn = node.querySelector('[data-confirm]');
  input.addEventListener('input', () => {
    confirmBtn.disabled = input.value.trim().toLowerCase() !== email.toLowerCase();
  });
  node.querySelector('[data-cancel]').addEventListener('click', closeModal);
  confirmBtn.addEventListener('click', async () => {
    try {
      await api('/api/auth/account', { method: 'DELETE' });
      closeModal();
      logout();
      toast('Account deleted');
    } catch (err) { toast(err.message, true); }
  });
  openModal(node);
  setTimeout(() => input.focus(), 50);
}
async function renderMembersView() {
  const team = currentTeam();
  const header = document.getElementById('content-header');
  const body = document.getElementById('content-body');
  header.innerHTML = `<h1><span data-lucide="users"></span> ${escapeHtml(team.name)} · Members</h1>`;
  let members = [];
  try { members = await api(`/api/teams/${team.id}/members`); } catch (err) { toast(err.message, true); }
  const amOwner = members.some((m) => m.id === State.user.id && m.role === 'owner');
  body.innerHTML = `
    <div style="max-width:640px; margin:24px auto; padding:0 20px;">
      ${amOwner ? `
      <div style="display:flex; gap:8px; margin-bottom:20px;">
        <input type="email" id="add-member-email" placeholder="Add member by email…"
          style="flex:1; padding:9px 12px; border:1px solid var(--border); border-radius:8px;" />
        <button class="btn btn-primary" data-add-member><span data-lucide="user-plus"></span>Add</button>
      </div>` : ''}
      <div id="members-list">
        ${members.map((m) => `
          <div class="member-row">
            <span class="avatar lg">${m.initials}</span>
            <div class="info">
              <div class="n">${escapeHtml(m.name)}</div>
              <div class="e">${escapeHtml(m.email)}</div>
            </div>
            ${m.role === 'owner' ? '<span class="role-tag">Owner</span>'
              : (amOwner ? `<button class="btn btn-sm btn-ghost" data-remove="${m.id}" style="color:var(--danger);">Remove</button>` : '')}
          </div>`).join('')}
      </div>
    </div>
  `;
  if (amOwner) {
    body.querySelector('[data-add-member]').addEventListener('click', async () => {
      const emailInput = body.querySelector('#add-member-email');
      const email = emailInput.value.trim();
      if (!email) return;
      try {
        await api(`/api/teams/${team.id}/members`, { method: 'POST', body: JSON.stringify({ email }) });
        State.teams = await api('/api/teams');
        renderSidebar();
        renderMembersView();
        toast('Member added');
      } catch (err) { toast(err.message, true); }
    });
    body.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.remove;
        try {
          await api(`/api/teams/${team.id}/members/${userId}`, { method: 'DELETE' });
          State.teams = await api('/api/teams');
          renderSidebar();
          renderMembersView();
          toast('Member removed');
        } catch (err) { toast(err.message, true); }
      });
    });
  }
  refreshIcons();
}
