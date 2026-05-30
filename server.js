const express = require('express');
const path = require('path');
require('./db/database');
const authRoutes = require('./routes/auth');
const teamRoutes = require('./routes/team');
const issueRoutes = require('./routes/issues');
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api', issueRoutes);
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
app.listen(PORT, () => {
  console.log(`Linear clone running on http://localhost:${PORT}`);
});
