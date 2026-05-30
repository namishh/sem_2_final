const { db, DEFAULT_LABELS } = require('./database');
function uniqueIdentifier(base) {
  let cleaned = (base || 'TM').replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3) || 'TM';
  let candidate = cleaned;
  let n = 1;
  const exists = db.prepare('SELECT 1 FROM teams WHERE identifier = ?');
  while (exists.get(candidate)) {
    candidate = cleaned + n;
    n++;
  }
  return candidate;
}
const createTeam = db.transaction((userId, name, baseIdentifier) => {
  const identifier = uniqueIdentifier(baseIdentifier || name);
  const info = db
    .prepare('INSERT INTO teams (name, identifier, created_by) VALUES (?, ?, ?)')
    .run(name, identifier, userId);
  const teamId = info.lastInsertRowid;
  db.prepare(
    "INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, 'owner')"
  ).run(teamId, userId);
  const insertLabel = db.prepare(
    'INSERT INTO labels (team_id, name, color) VALUES (?, ?, ?)'
  );
  for (const l of DEFAULT_LABELS) insertLabel.run(teamId, l.name, l.color);
  return { id: teamId, name, identifier };
});
function isMember(teamId, userId) {
  return !!db
    .prepare('SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?')
    .get(teamId, userId);
}
function isOwner(teamId, userId) {
  return !!db
    .prepare("SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ? AND role = 'owner'")
    .get(teamId, userId);
}
module.exports = { createTeam, uniqueIdentifier, isMember, isOwner };
