function renderSidebar() {
  const sidebar = document.getElementById('sidebar');
  const u = State.user;
  const teamsHtml = State.teams.map((team) => {
    const isActiveTeam = team.id === State.currentTeamId;
    const collapsed = isActiveTeam ? '' : 'collapsed';
    const navItems = [
      { view: 'my', label: 'My Issues', icon: 'user' },
      { view: 'all', label: 'All Issues', icon: 'layers' },
      { view: 'backlog', label: 'Backlog', icon: 'inbox' },
      { view: 'members', label: 'Members', icon: 'users' }
    ];
    const sub = isActiveTeam
      ? `<div class="team-sub">
          ${navItems
            .map(
              (n) => `
            <div class="nav-item ${State.currentView === n.view && isActiveTeam ? 'active' : ''}"
                 data-team="${team.id}" data-view="${n.view}">
              <span data-lucide="${n.icon}"></span>${n.label}
            </div>`
            )
            .join('')}
          <div class="team-members-row">
            ${(team.members || [])
              .map((m) => `<span class="avatar" title="${escapeHtml(m.name)}">${m.initials}</span>`)
              .join('')}
          </div>
        </div>`
      : '';
    return `
      <div class="side-section">
        <div class="team-header ${collapsed}" data-team-toggle="${team.id}">
          <span class="team-badge">${escapeHtml(team.identifier)}</span>
          <span>${escapeHtml(team.name)}</span>
          <span class="chev" data-lucide="chevron-down"></span>
        </div>
        ${sub}
      </div>`;
  }).join('');
  sidebar.innerHTML = `
    <div class="user-block" data-open-settings>
      <span class="avatar">${initials(u.name)}</span>
      <span class="uname">${escapeHtml(u.name)}</span>
      <button class="icon-btn" title="Settings"><span data-lucide="settings"></span></button>
    </div>
    <div class="teams-wrap">${teamsHtml}</div>
    <div class="sidebar-bottom">
      <button class="side-btn" data-new-team><span data-lucide="plus"></span>New Team</button>
      <button class="side-btn danger" data-delete-account><span data-lucide="trash-2"></span>Delete Account</button>
    </div>
  `;
  sidebar.querySelectorAll('[data-team-toggle]').forEach((h) => {
    h.addEventListener('click', () => {
      const teamId = Number(h.dataset.teamToggle);
      if (teamId !== State.currentTeamId) {
        State.currentTeamId = teamId;
        State.currentView = 'all';
        State.filters = {};
        renderSidebar();
        renderIssuesView();
      } else {
        h.classList.toggle('collapsed');
      }
    });
  });
  sidebar.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      State.currentTeamId = Number(item.dataset.team);
      State.currentView = item.dataset.view;
      State.filters = {};
      renderSidebar();
      if (item.dataset.view === 'members') renderMembersView();
      else renderIssuesView();
    });
  });
  sidebar.querySelector('[data-open-settings]').addEventListener('click', openSettings);
  sidebar.querySelector('[data-new-team]').addEventListener('click', openNewTeamModal);
  sidebar.querySelector('[data-delete-account]').addEventListener('click', openDeleteAccountModal);
  refreshIcons();
}
