const express = require('express');
const { db } = require('../db/database');
const { createTeam, isMember, isOwner } = require('../db/helpers');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);
function memberAvatar(name) {
  return (name || '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
router.get('/', (req, res) => {
  const teams = db
    .prepare(
      `SELECT t.*, tm.role
       FROM teams t
       JOIN team_members tm ON tm.team_id = t.id
       WHERE tm.user_id = ?
       ORDER BY t.created_at ASC`
    )
    .all(req.user.userId);
  const membersStmt = db.prepare(
    `SELECT u.id, u.name, u.email, tm.role
     FROM team_members tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = ?
     ORDER BY tm.role = 'owner' DESC, u.name ASC`
  );
  for (const t of teams) {
    t.members = membersStmt.all(t.id).map((m) => ({ ...m, initials: memberAvatar(m.name) }));
  }
  res.json(teams);
});
router.post('/', (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Team name is required' });
  const team = createTeam(req.user.userId, name.trim(), name.trim());
  res.status(201).json(team);
});
router.get('/:teamId/members', (req, res) => {
  const teamId = Number(req.params.teamId);
  if (!isMember(teamId, req.user.userId)) return res.status(403).json({ error: 'Not a team member' });
  const members = db
    .prepare(
      `SELECT u.id, u.name, u.email, tm.role
       FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = ?
       ORDER BY tm.role = 'owner' DESC, u.name ASC`
    )
    .all(teamId)
    .map((m) => ({ ...m, initials: memberAvatar(m.name) }));
  res.json(members);
});
router.post('/:teamId/members', (req, res) => {
  const teamId = Number(req.params.teamId);
  const { email } = req.body || {};
  if (!isOwner(teamId, req.user.userId)) {
    return res.status(403).json({ error: 'Only the team owner can add members' });
  }
  if (!email) return res.status(400).json({ error: 'Email is required' });
  const user = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) return res.status(404).json({ error: 'No user found with that email' });
  const already = db
    .prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?')
    .get(teamId, user.id);
  if (already) return res.status(409).json({ error: 'User is already a team member' });
  db.prepare("INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'member')").run(
    teamId,
    user.id
  );
  res.status(201).json({ ...user, role: 'member', initials: memberAvatar(user.name) });
});
router.delete('/:teamId/members/:userId', (req, res) => {
  const teamId = Number(req.params.teamId);
  const targetId = Number(req.params.userId);
  if (!isOwner(teamId, req.user.userId)) {
    return res.status(403).json({ error: 'Only the team owner can remove members' });
  }
  const target = db
    .prepare('SELECT role FROM team_members WHERE team_id = ? AND user_id = ?')
    .get(teamId, targetId);
  if (!target) return res.status(404).json({ error: 'Member not found' });
  if (target.role === 'owner') return res.status(400).json({ error: 'Cannot remove the team owner' });
  db.prepare('UPDATE issues SET assignee_id = NULL WHERE team_id = ? AND assignee_id = ?').run(
    teamId,
    targetId
  );
  db.prepare('DELETE FROM team_members WHERE team_id = ? AND user_id = ?').run(teamId, targetId);
  res.json({ ok: true });
});
router.get('/:teamId/labels', (req, res) => {
  const teamId = Number(req.params.teamId);
  if (!isMember(teamId, req.user.userId)) return res.status(403).json({ error: 'Not a team member' });
  const labels = db.prepare('SELECT * FROM labels WHERE team_id = ? ORDER BY name ASC').all(teamId);
  res.json(labels);
});
router.post('/:teamId/labels', (req, res) => {
  const teamId = Number(req.params.teamId);
  const { name, color } = req.body || {};
  if (!isOwner(teamId, req.user.userId)) {
    return res.status(403).json({ error: 'Only the team owner can create labels' });
  }
  if (!name || !name.trim()) return res.status(400).json({ error: 'Label name is required' });
  const info = db
    .prepare('INSERT INTO labels (team_id, name, color) VALUES (?, ?, ?)')
    .run(teamId, name.trim(), color || '#6366f1');
  res.status(201).json(db.prepare('SELECT * FROM labels WHERE id = ?').get(info.lastInsertRowid));
});
module.exports = router;
