const express = require('express');
const { db } = require('../db/database');
const { isMember } = require('../db/helpers');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();
router.use(requireAuth);
const VALID_STATUS = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'cancelled'];
const VALID_PRIORITY = ['urgent', 'high', 'medium', 'low', 'none'];

function initials(name) {
  return (name || '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function hydrateIssue(issue, { withComments = false } = {}) {
  if (!issue) return issue;
  issue.labels = db
    .prepare(
      `SELECT l.id, l.name, l.color
       FROM issue_labels il JOIN labels l ON l.id = il.label_id
       WHERE il.issue_id = ?
       ORDER BY l.name ASC`
    )
    .all(issue.id);
  if (issue.assignee_id) {
    const a = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(issue.assignee_id);
    issue.assignee = a ? { ...a, initials: initials(a.name) } : null;
  } else {
    issue.assignee = null;
  }
  const team = db.prepare('SELECT identifier FROM teams WHERE id = ?').get(issue.team_id);
  issue.key = team ? `${team.identifier}-${issue.number}` : `#${issue.number}`;
  if (withComments) {
    issue.comments = db
      .prepare(
        `SELECT c.*, u.name AS author_name
         FROM comments c LEFT JOIN users u ON u.id = c.author_id
         WHERE c.issue_id = ?
         ORDER BY c.created_at ASC`
      )
      .all(issue.id)
      .map((c) => ({ ...c, author_initials: initials(c.author_name) }));
  }
  return issue;
}

function teamGuard(req, res, next) {
  const teamId = Number(req.params.teamId);
  if (!isMember(teamId, req.user.userId)) return res.status(403).json({ error: 'Not a team member' });
  next();
}

function loadAccessibleIssue(issueId, userId) {
  const issue = db.prepare('SELECT * FROM issues WHERE id = ?').get(issueId);
  if (!issue) return { error: 404 };
  if (!isMember(issue.team_id, userId)) return { error: 403 };
  return { issue };
}

router.get('/teams/:teamId/issues', teamGuard, (req, res) => {
  const teamId = Number(req.params.teamId);
  const { status, priority, labelId, assignee } = req.query;
  const conditions = ['i.team_id = ?'];
  const params = [teamId];
  let join = '';
  if (status) {
    conditions.push('i.status = ?');
    params.push(status);
  }
  if (priority) {
    conditions.push('i.priority = ?');
    params.push(priority);
  }
  if (assignee) {
    if (assignee === 'me') {
      conditions.push('i.assignee_id = ?');
      params.push(req.user.userId);
    } else if (assignee === 'unassigned') {
      conditions.push('i.assignee_id IS NULL');
    } else {
      conditions.push('i.assignee_id = ?');
      params.push(Number(assignee));
    }
  }
  if (labelId) {
    join = 'JOIN issue_labels il ON il.issue_id = i.id';
    conditions.push('il.label_id = ?');
    params.push(Number(labelId));
  }
  const rows = db
    .prepare(
      `SELECT DISTINCT i.* FROM issues i ${join}
       WHERE ${conditions.join(' AND ')}
       ORDER BY i.updated_at DESC, i.number DESC`
    )
    .all(...params);
  res.json(rows.map((r) => hydrateIssue(r)));
});
router.post('/teams/:teamId/issues', teamGuard, (req, res) => {
  const teamId = Number(req.params.teamId);
  const { title, description, priority, status, assigneeId, labelIds } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
  const pr = VALID_PRIORITY.includes(priority) ? priority : 'none';
  const st = VALID_STATUS.includes(status) ? status : 'backlog';
  const create = db.transaction(() => {
    const next =
      db.prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM issues WHERE team_id = ?').get(teamId)
        .n;
    const info = db
      .prepare(
        `INSERT INTO issues (team_id, number, title, description, status, priority, assignee_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        teamId,
        next,
        title.trim(),
        description || null,
        st,
        pr,
        assigneeId || null,
        req.user.userId
      );
    const issueId = info.lastInsertRowid;
    if (Array.isArray(labelIds)) {
      const ins = db.prepare(
        'INSERT OR IGNORE INTO issue_labels (issue_id, label_id) VALUES (?, ?)'
      );
      for (const lid of labelIds) ins.run(issueId, Number(lid));
    }
    return issueId;
  });
  const id = create();
  res.status(201).json(hydrateIssue(db.prepare('SELECT * FROM issues WHERE id = ?').get(id), { withComments: true }));
});

router.get('/issues/:id', (req, res) => {
  const { issue, error } = loadAccessibleIssue(Number(req.params.id), req.user.userId);
  if (error) return res.status(error).json({ error: error === 404 ? 'Issue not found' : 'Forbidden' });
  res.json(hydrateIssue(issue, { withComments: true }));
});

router.patch('/issues/:id', (req, res) => {
  const id = Number(req.params.id);
  const { issue, error } = loadAccessibleIssue(id, req.user.userId);
  if (error) return res.status(error).json({ error: error === 404 ? 'Issue not found' : 'Forbidden' });
  const fields = [];
  const params = [];
  const body = req.body || {};
  if (body.title !== undefined) {
    if (!body.title.trim()) return res.status(400).json({ error: 'Title cannot be empty' });
    fields.push('title = ?');
    params.push(body.title.trim());
  }
  if (body.description !== undefined) {
    fields.push('description = ?');
    params.push(body.description || null);
  }
  if (body.status !== undefined) {
    if (!VALID_STATUS.includes(body.status)) return res.status(400).json({ error: 'Invalid status' });
    fields.push('status = ?');
    params.push(body.status);
  }
  if (body.priority !== undefined) {
    if (!VALID_PRIORITY.includes(body.priority))
      return res.status(400).json({ error: 'Invalid priority' });
    fields.push('priority = ?');
    params.push(body.priority);
  }
  if (body.assigneeId !== undefined) {
    fields.push('assignee_id = ?');
    params.push(body.assigneeId || null);
  }
  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
  fields.push("updated_at = CURRENT_TIMESTAMP");
  params.push(id);
  db.prepare(`UPDATE issues SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  res.json(hydrateIssue(db.prepare('SELECT * FROM issues WHERE id = ?').get(id), { withComments: true }));
});

router.delete('/issues/:id', (req, res) => {
  const id = Number(req.params.id);
  const { error } = loadAccessibleIssue(id, req.user.userId);
  if (error) return res.status(error).json({ error: error === 404 ? 'Issue not found' : 'Forbidden' });
  db.prepare('DELETE FROM issues WHERE id = ?').run(id);
  res.json({ ok: true });
});

router.post('/issues/:id/labels', (req, res) => {
  const id = Number(req.params.id);
  const { issue, error } = loadAccessibleIssue(id, req.user.userId);
  if (error) return res.status(error).json({ error: error === 404 ? 'Issue not found' : 'Forbidden' });
  const labelId = Number((req.body || {}).labelId);
  const label = db.prepare('SELECT * FROM labels WHERE id = ? AND team_id = ?').get(labelId, issue.team_id);
  if (!label) return res.status(404).json({ error: 'Label not found for this team' });
  db.prepare('INSERT OR IGNORE INTO issue_labels (issue_id, label_id) VALUES (?, ?)').run(id, labelId);
  res.status(201).json(hydrateIssue(db.prepare('SELECT * FROM issues WHERE id = ?').get(id)));
});

router.delete('/issues/:id/labels/:labelId', (req, res) => {
  const id = Number(req.params.id);
  const { error } = loadAccessibleIssue(id, req.user.userId);
  if (error) return res.status(error).json({ error: error === 404 ? 'Issue not found' : 'Forbidden' });
  db.prepare('DELETE FROM issue_labels WHERE issue_id = ? AND label_id = ?').run(
    id,
    Number(req.params.labelId)
  );
  res.json(hydrateIssue(db.prepare('SELECT * FROM issues WHERE id = ?').get(id)));
});

router.get('/issues/:id/comments', (req, res) => {
  const id = Number(req.params.id);
  const { error } = loadAccessibleIssue(id, req.user.userId);
  if (error) return res.status(error).json({ error: error === 404 ? 'Issue not found' : 'Forbidden' });
  const comments = db
    .prepare(
      `SELECT c.*, u.name AS author_name
       FROM comments c LEFT JOIN users u ON u.id = c.author_id
       WHERE c.issue_id = ? ORDER BY c.created_at ASC`
    )
    .all(id)
    .map((c) => ({ ...c, author_initials: initials(c.author_name) }));
  res.json(comments);
});

router.post('/issues/:id/comments', (req, res) => {
  const id = Number(req.params.id);
  const { error } = loadAccessibleIssue(id, req.user.userId);
  if (error) return res.status(error).json({ error: error === 404 ? 'Issue not found' : 'Forbidden' });
  const text = ((req.body || {}).body || '').trim();
  if (!text) return res.status(400).json({ error: 'Comment cannot be empty' });
  const info = db
    .prepare('INSERT INTO comments (issue_id, author_id, body) VALUES (?, ?, ?)')
    .run(id, req.user.userId, text);
  db.prepare("UPDATE issues SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  const c = db
    .prepare(
      `SELECT c.*, u.name AS author_name FROM comments c
       LEFT JOIN users u ON u.id = c.author_id WHERE c.id = ?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json({ ...c, author_initials: initials(c.author_name) });
});

module.exports = router;
