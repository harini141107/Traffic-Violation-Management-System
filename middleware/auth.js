function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role)) {
      return res.status(403).send('Access denied. You do not have permission to view this page.');
    }
    next();
  };
}

module.exports = { requireLogin, requireRole };