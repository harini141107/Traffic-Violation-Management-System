const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const { requireLogin, requireRole } = require('../middleware/auth');

const adminOnly = [requireLogin, requireRole(['admin'])];

router.get('/admin', ...adminOnly, (req, res) => res.redirect('/admin/dashboard'));

router.get('/admin/dashboard', ...adminOnly, async (req, res) => {
  const empty = {
    totalUsers: 0, totalOfficers: 0, totalViolators: 0, totalVehicles: 0,
    totalViolations: 0, totalChallans: 0, pendingChallans: 0,
    totalCollected: 0, pendingDisputes: 0, resolvedDisputes: 0,
    recentViolations: [], byType: [], challanStatus: [], disputesByStatus: [],
    monthlyViolations: [], monthlyCollections: [], officerActivity: []
  };

  try {
    const [[stats]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS totalUsers,
        (SELECT COUNT(*) FROM users WHERE role = 'officer') AS totalOfficers,
        (SELECT COUNT(*) FROM violators) AS totalViolators,
        (SELECT COUNT(*) FROM vehicles) AS totalVehicles,
        (SELECT COUNT(*) FROM violations) AS totalViolations,
        (SELECT COUNT(*) FROM challans) AS totalChallans,
        (SELECT COUNT(*) FROM challans WHERE status = 'Unpaid') AS pendingChallans,
        (SELECT COALESCE(SUM(amount_paid), 0) FROM payments) AS totalCollected,
        (SELECT COUNT(*) FROM disputes WHERE status = 'Pending') AS pendingDisputes,
        (SELECT COUNT(*) FROM disputes WHERE status IN ('Upheld','Dismissed')) AS resolvedDisputes
    `);

    const [recentViolations] = await pool.query(`
      SELECT v.violation_id, v.violation_type, v.location, v.violation_date,
             veh.registration_no, vio.name AS violator_name
      FROM violations v
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      ORDER BY v.violation_date DESC
      LIMIT 8
    `);

    const [byType] = await pool.query(`
      SELECT violation_type, COUNT(*) AS count
      FROM violations GROUP BY violation_type ORDER BY count DESC
    `);

    const [challanStatus] = await pool.query(`
      SELECT status, COUNT(*) AS count
      FROM challans GROUP BY status ORDER BY status
    `);

    const [disputesByStatus] = await pool.query(`
      SELECT status, COUNT(*) AS count
      FROM disputes GROUP BY status ORDER BY status
    `);

    const [monthlyViolations] = await pool.query(`
      SELECT DATE_FORMAT(violation_date, '%Y-%m') AS month, COUNT(*) AS count
      FROM violations
      WHERE violation_date >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)
      GROUP BY DATE_FORMAT(violation_date, '%Y-%m')
      ORDER BY month
    `);

    const [monthlyCollections] = await pool.query(`
      SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
             COALESCE(SUM(amount_paid),0) AS amount
      FROM payments
      WHERE payment_date >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)
      GROUP BY DATE_FORMAT(payment_date, '%Y-%m')
      ORDER BY month
    `);

    const [officerActivity] = await pool.query(`
      SELECT u.user_id, u.username, 0 AS violation_count
      FROM users u
      WHERE u.role = 'officer'
      ORDER BY u.username
    `);

    res.render('admin/dashboard', {
      user: req.session.user,
      stats: { ...empty, ...stats },
      recentViolations, byType, challanStatus, disputesByStatus,
      monthlyViolations, monthlyCollections, officerActivity,
      error: null
    });
  } catch (err) {
    console.error(err);
    res.render('admin/dashboard', { user: req.session.user, stats: empty,
      recentViolations: [], byType: [], challanStatus: [], disputesByStatus: [],
      monthlyViolations: [], monthlyCollections: [], officerActivity: [],
      error: 'Could not load administrator dashboard statistics.' });
  }
});

router.get('/admin/users', ...adminOnly, async (req, res) => {
  const search = String(req.query.search || '').trim();
  const role = String(req.query.role || '').trim();
  let query = `
    SELECT u.user_id, u.username, u.role, u.violator_id, u.created_at,
           v.name AS violator_name, v.license_no
    FROM users u
    LEFT JOIN violators v ON u.violator_id = v.violator_id
    WHERE 1=1`;
  const params = [];
  if (search) {
    query += ' AND (u.username LIKE ? OR v.name LIKE ? OR v.license_no LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (role && ['admin','officer','violator'].includes(role)) {
    query += ' AND u.role = ?';
    params.push(role);
  }
  query += ' ORDER BY u.created_at DESC';

  try {
    const [users] = await pool.query(query, params);
    res.render('admin/users', { user: req.session.user, users, filters: { search, role }, error: null });
  } catch (err) {
    console.error(err);
    res.render('admin/users', { user: req.session.user, users: [], filters: { search, role },
      error: 'Could not load users.' });
  }
});

router.get('/admin/users/add', ...adminOnly, async (req, res) => {
  try {
    const [violators] = await pool.query(`
      SELECT violator_id, name, license_no
      FROM violators
      WHERE violator_id NOT IN (SELECT violator_id FROM users WHERE violator_id IS NOT NULL)
      ORDER BY name
    `);
    res.render('admin/user-form', { user: req.session.user, target: null, violators, mode: 'add', error: null });
  } catch (err) {
    console.error(err);
    res.render('admin/user-form', { user: req.session.user, target: null, violators: [], mode: 'add',
      error: 'Could not load user form.' });
  }
});

router.post('/admin/users/add', ...adminOnly, async (req, res) => {
  const { username, password, role, violator_id } = req.body;
  try {
    if (!username || !password || !['admin','officer','violator'].includes(role)) {
      throw new Error('Invalid input');
    }
    if (role === 'violator' && !violator_id) {
      throw new Error('A violator account must be linked to a violator record.');
    }
    const hashed = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, password, role, violator_id) VALUES (?, ?, ?, ?)',
      [username.trim(), hashed, role, role === 'violator' ? violator_id : null]
    );
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    let violators = [];
    try {
      [violators] = await pool.query(`
        SELECT violator_id, name, license_no FROM violators
        WHERE violator_id NOT IN (SELECT violator_id FROM users WHERE violator_id IS NOT NULL)
        ORDER BY name
      `);
    } catch (_) {}
    res.render('admin/user-form', { user: req.session.user, target: req.body, violators,
      mode: 'add', error: 'Could not create user. Check the username, role and linked violator.' });
  }
});

router.get('/admin/users/edit/:id', ...adminOnly, async (req, res) => {
  try {
    const [[target]] = await pool.query(`
      SELECT user_id, username, role, violator_id, created_at
      FROM users WHERE user_id = ?
    `, [req.params.id]);
    if (!target) return res.redirect('/admin/users');

    const [violators] = await pool.query(`
      SELECT violator_id, name, license_no FROM violators
      WHERE violator_id NOT IN (
        SELECT violator_id FROM users WHERE violator_id IS NOT NULL AND user_id <> ?
      ) OR violator_id = ?
      ORDER BY name
    `, [target.user_id, target.violator_id || -1]);

    res.render('admin/user-form', { user: req.session.user, target, violators, mode: 'edit', error: null });
  } catch (err) {
    console.error(err);
    res.redirect('/admin/users');
  }
});

router.post('/admin/users/edit/:id', ...adminOnly, async (req, res) => {
  const { username, password, role, violator_id } = req.body;
  try {
    if (!username || !['admin','officer','violator'].includes(role)) throw new Error('Invalid input');
    if (role === 'violator' && !violator_id) throw new Error('Violator link required');

    const targetId = Number(req.params.id);
    const [[target]] = await pool.query('SELECT user_id, role FROM users WHERE user_id = ?', [targetId]);
    if (!target) return res.redirect('/admin/users');

    if (targetId === req.session.user.id && role !== 'admin') {
      return res.status(400).send('You cannot remove your own admin role.');
    }

    const linkedId = role === 'violator' ? violator_id : null;
    if (password && password.trim()) {
      const hashed = await bcrypt.hash(password.trim(), 10);
      await pool.query(
        'UPDATE users SET username = ?, password = ?, role = ?, violator_id = ? WHERE user_id = ?',
        [username.trim(), hashed, role, linkedId, targetId]
      );
    } else {
      await pool.query(
        'UPDATE users SET username = ?, role = ?, violator_id = ? WHERE user_id = ?',
        [username.trim(), role, linkedId, targetId]
      );
    }
    if (targetId === req.session.user.id) {
      req.session.user.username = username.trim();
      req.session.user.role = role;
      req.session.user.violator_id = linkedId;
    }
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/users/edit/' + req.params.id);
  }
});

router.post('/admin/users/delete/:id', ...adminOnly, async (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.session.user.id) return res.status(400).send('You cannot delete your own account.');
  try {
    await pool.query('DELETE FROM users WHERE user_id = ?', [targetId]);
    res.redirect('/admin/users');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/users');
  }
});

router.get('/admin/officers', ...adminOnly, async (req, res) => {
  try {
    const [officers] = await pool.query(`
      SELECT u.user_id, u.username, u.created_at, 0 AS violation_count
      FROM users u
      WHERE u.role = 'officer'
      ORDER BY u.created_at DESC
    `);
    res.render('admin/officers', { user: req.session.user, officers, error: null });
  } catch (err) {
    console.error(err);
    res.render('admin/officers', { user: req.session.user, officers: [], error: 'Could not load officers.' });
  }
});

router.get('/admin/violators/:id', ...adminOnly, async (req, res) => {
  try {
    const [[violator]] = await pool.query('SELECT * FROM violators WHERE violator_id = ?', [req.params.id]);
    if (!violator) return res.redirect('/violators');
    const [vehicles] = await pool.query(`
      SELECT * FROM vehicles
      WHERE owner_name = ?
      ORDER BY created_at DESC
    `, [violator.name]);
    const [history] = await pool.query(`
      SELECT v.violation_id, v.violation_type, v.location, v.violation_date,
             veh.registration_no, c.challan_id, c.fine_amount, c.status
      FROM violations v
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      LEFT JOIN challans c ON v.violation_id = c.violation_id
      WHERE v.violator_id = ?
      ORDER BY v.violation_date DESC
    `, [req.params.id]);
    res.render('admin/violator-detail', { user: req.session.user, violator, vehicles, history, error: null });
  } catch (err) {
    console.error(err);
    res.redirect('/violators');
  }
});

router.get('/admin/vehicles/:id', ...adminOnly, async (req, res) => {
  try {
    const [[vehicle]] = await pool.query('SELECT * FROM vehicles WHERE vehicle_id = ?', [req.params.id]);
    if (!vehicle) return res.redirect('/vehicles');
    const [violations] = await pool.query(`
      SELECT v.violation_id, v.violation_type, v.location, v.violation_date,
             vio.name AS violator_name, c.challan_id, c.fine_amount, c.status
      FROM violations v
      JOIN violators vio ON v.violator_id = vio.violator_id
      LEFT JOIN challans c ON v.violation_id = c.violation_id
      WHERE v.vehicle_id = ?
      ORDER BY v.violation_date DESC
    `, [req.params.id]);
    res.render('admin/vehicle-detail', { user: req.session.user, vehicle, violations, error: null });
  } catch (err) {
    console.error(err);
    res.redirect('/vehicles');
  }
});

router.get('/admin/violations/:id', ...adminOnly, async (req, res) => {
  try {
    const [[violation]] = await pool.query(`
      SELECT v.*, veh.registration_no, veh.owner_name, vio.name AS violator_name,
             vio.license_no, c.challan_id, c.fine_amount, c.status AS challan_status,
             c.due_date
      FROM violations v
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      LEFT JOIN challans c ON v.violation_id = c.violation_id
      WHERE v.violation_id = ?
    `, [req.params.id]);
    if (!violation) return res.redirect('/violations');
    res.render('admin/violation-detail', { user: req.session.user, violation, error: null });
  } catch (err) {
    console.error(err);
    res.redirect('/violations');
  }
});

router.get('/admin/challans', ...adminOnly, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const status = String(req.query.status || '').trim();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  let query = `
    SELECT c.challan_id, c.fine_amount, c.status, c.due_date, c.created_at,
           v.violation_type, v.violation_date, veh.registration_no,
           vio.name AS violator_name,
           (SELECT MAX(p.payment_date) FROM payments p WHERE p.challan_id = c.challan_id) AS payment_date,
           (SELECT COALESCE(SUM(p.amount_paid),0) FROM payments p WHERE p.challan_id = c.challan_id) AS paid_amount
    FROM challans c
    JOIN violations v ON c.violation_id = v.violation_id
    JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
    JOIN violators vio ON v.violator_id = vio.violator_id
    WHERE 1=1`;
  const params = [];
  if (q) {
    query += ` AND (CAST(c.challan_id AS CHAR) LIKE ? OR veh.registration_no LIKE ? OR
                    vio.name LIKE ? OR vio.license_no LIKE ? OR v.violation_type LIKE ?)`;
    const x = `%${q}%`;
    params.push(x,x,x,x,x);
  }
  if (status && ['Paid','Unpaid'].includes(status)) { query += ' AND c.status = ?'; params.push(status); }
  if (from) { query += ' AND DATE(v.violation_date) >= ?'; params.push(from); }
  if (to) { query += ' AND DATE(v.violation_date) <= ?'; params.push(to); }
  query += ' ORDER BY c.created_at DESC';

  try {
    const [challans] = await pool.query(query, params);
    const [[summary]] = await pool.query(`
      SELECT COUNT(*) AS total,
             SUM(status='Paid') AS paid,
             SUM(status='Unpaid') AS unpaid,
             COALESCE(SUM(fine_amount),0) AS assessed,
             COALESCE((SELECT SUM(amount_paid) FROM payments),0) AS collected
      FROM challans
    `);
    res.render('admin/challans', { user: req.session.user, challans, summary,
      filters: { q, status, from, to }, error: null });
  } catch (err) {
    console.error(err);
    res.render('admin/challans', { user: req.session.user, challans: [],
      summary: { total:0,paid:0,unpaid:0,assessed:0,collected:0 },
      filters: { q, status, from, to }, error: 'Could not load challans.' });
  }
});

router.get('/admin/disputes', ...adminOnly, async (req, res) => {
  try {
    const [disputes] = await pool.query(`
      SELECT d.dispute_id, d.reason, d.status, d.filed_date, d.resolved_date, d.resolution_note,
             c.challan_id, c.fine_amount, c.status AS challan_status,
             v.violation_id, v.violation_type, v.violation_date,
             vio.violator_id, vio.name AS violator_name, vio.license_no,
             veh.registration_no
      FROM disputes d
      JOIN challans c ON d.challan_id = c.challan_id
      JOIN violations v ON c.violation_id = v.violation_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      ORDER BY CASE WHEN d.status='Pending' THEN 0 ELSE 1 END, d.filed_date DESC
    `);
    res.render('admin/disputes', { user: req.session.user, disputes, error: null });
  } catch (err) {
    console.error(err);
    res.render('admin/disputes', { user: req.session.user, disputes: [], error: 'Could not load disputes.' });
  }
});

router.get('/admin/reports', ...adminOnly, async (req, res) => {
  try {
    const [[totals]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM vehicles) AS vehicles,
        (SELECT COUNT(*) FROM violators) AS violators,
        (SELECT COUNT(*) FROM violations) AS violations,
        (SELECT COUNT(*) FROM challans) AS challans,
        (SELECT COUNT(*) FROM challans WHERE status='Paid') AS paid_challans,
        (SELECT COUNT(*) FROM challans WHERE status='Unpaid') AS pending_challans,
        (SELECT COALESCE(SUM(amount_paid),0) FROM payments) AS collected,
        (SELECT COUNT(*) FROM disputes WHERE status='Pending') AS pending_disputes,
        (SELECT COUNT(*) FROM disputes WHERE status IN ('Upheld','Dismissed')) AS resolved_disputes
    `);
    const [byType] = await pool.query(`
      SELECT violation_type, COUNT(*) AS count
      FROM violations GROUP BY violation_type ORDER BY count DESC
    `);
    const [overTime] = await pool.query(`
      SELECT DATE_FORMAT(violation_date, '%Y-%m') AS month, COUNT(*) AS count
      FROM violations GROUP BY DATE_FORMAT(violation_date, '%Y-%m') ORDER BY month
    `);
    const [fineCollection] = await pool.query(`
      SELECT DATE_FORMAT(payment_date, '%Y-%m') AS month,
             COALESCE(SUM(amount_paid),0) AS amount
      FROM payments GROUP BY DATE_FORMAT(payment_date, '%Y-%m') ORDER BY month
    `);
    const [challanStatus] = await pool.query(`
      SELECT status, COUNT(*) AS count FROM challans GROUP BY status
    `);
    const [disputeStats] = await pool.query(`
      SELECT status, COUNT(*) AS count FROM disputes GROUP BY status
    `);
    const [vehicleStats] = await pool.query(`
      SELECT vehicle_type, COUNT(*) AS count FROM vehicles GROUP BY vehicle_type ORDER BY count DESC
    `);
    const [violatorStats] = await pool.query(`
      SELECT license_status, COUNT(*) AS count FROM violators GROUP BY license_status
    `);
    res.render('admin/reports', {
      user: req.session.user, totals, byType, overTime, fineCollection,
      challanStatus, disputeStats, vehicleStats, violatorStats, error: null
    });
  } catch (err) {
    console.error(err);
    res.render('admin/reports', {
      user: req.session.user,
      totals: {vehicles:0,violators:0,violations:0,challans:0,paid_challans:0,pending_challans:0,collected:0,pending_disputes:0,resolved_disputes:0},
      byType: [], overTime: [], fineCollection: [], challanStatus: [], disputeStats: [],
      vehicleStats: [], violatorStats: [], error: 'Could not load reports.'
    });
  }
});

router.get('/admin/search', ...adminOnly, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const from = String(req.query.from || '').trim();
  const to = String(req.query.to || '').trim();
  let results = [];
  try {
    if (q || from || to) {
      let query = `
        SELECT v.violation_id, v.violation_type, v.location, v.violation_date,
               veh.registration_no, vio.name AS violator_name, vio.license_no,
               c.challan_id, c.status AS challan_status, c.fine_amount
        FROM violations v
        JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
        JOIN violators vio ON v.violator_id = vio.violator_id
        LEFT JOIN challans c ON v.violation_id = c.violation_id
        WHERE 1=1`;
      const params = [];
      if (q) {
        query += ` AND (veh.registration_no LIKE ? OR vio.license_no LIKE ? OR
                        vio.name LIKE ? OR CAST(v.violation_id AS CHAR) LIKE ? OR
                        CAST(c.challan_id AS CHAR) LIKE ? OR v.violation_type LIKE ?)`;
        const x = `%${q}%`;
        params.push(x,x,x,x,x,x);
      }
      if (from) { query += ' AND DATE(v.violation_date) >= ?'; params.push(from); }
      if (to) { query += ' AND DATE(v.violation_date) <= ?'; params.push(to); }
      query += ' ORDER BY v.violation_date DESC';
      [results] = await pool.query(query, params);
    }
    res.render('admin/search', { user: req.session.user, results, filters: { q, from, to }, searched: !!(q||from||to), error: null });
  } catch (err) {
    console.error(err);
    res.render('admin/search', { user: req.session.user, results: [], filters: { q, from, to },
      searched: !!(q||from||to), error: 'Search failed. Check the filters and try again.' });
  }
});

module.exports = router;
