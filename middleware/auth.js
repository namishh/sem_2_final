const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'aslkdfhkl2j3hlk';
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  const token = header.replace('Bearer ', '');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
module.exports = { requireAuth, JWT_SECRET };
