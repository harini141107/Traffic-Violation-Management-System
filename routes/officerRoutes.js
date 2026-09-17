const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireLogin, requireRole } = require('../middleware/auth');

const officerOnly = [requireLogin, requireRole(['officer'])];

const FINE_RATES = {
  'Signal Jumping': 1000,
  'No Helmet': 500,
  'Triple Riding': 500,
  'Wrong Side Driving': 1500,
  'Speeding': 1000,
  'No Seatbelt': 500,
  'Illegal Parking': 300,
  'Driving Without License': 2000,
};

const DEMERIT_POINTS = {
  'Signal Jumping': 4,
  'No Helmet': 2,
  'Triple Riding': 2,
  'Wrong Side Driving': 5,
  'Speeding': 4,
  'No Seatbelt': 2,
  'Illegal Parking': 1,
  'Driving Without License': 6,
};

const VIOLATION_TYPES = Object.keys(FINE_RATES);
const DEMERIT_THRESHOLD = 12;

router.get('/officer', ...officerOnly, (req, res) => res.redirect('/officer/dashboard'));

router.get('/officer/dashboard', ...officerOnly, async (req, res) => {
  const empty = {
    violationsRecorded: 0,
    challansGenerated: 0,
    pendingChallans: 0,
    pendingDisputes: 0,
    recentViolations: [],
    recentChallans: [],
    pendingChallanRows: [],
    recentDisputes: [],
  };
  try {
    const [[stats]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM violations) AS violationsRecorded,
        (SELECT COUNT(*) FROM challans) AS challansGenerated,
        (SELECT COUNT(*) FROM challans WHERE status = 'Unpaid') AS pendingChallans,
        (SELECT COUNT(*) FROM disputes WHERE status = 'Pending') AS pendingDisputes
    `);

    const [recentViolations] = await pool.query(`
      SELECT v.violation_id, v.violation_type, v.location, v.violation_date,
             veh.registration_no, vio.name AS violator_name
      FROM violations v
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      ORDER BY v.violation_date DESC LIMIT 6
    `);

    const [recentChallans] = await pool.query(`
      SELECT c.challan_id, c.fine_amount, c.status, c.due_date,
             v.violation_type, veh.registration_no, vio.name AS violator_name
      FROM challans c
      JOIN violations v ON c.violation_id = v.violation_id
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      ORDER BY c.created_at DESC LIMIT 6
    `);

    const [pendingChallanRows] = await pool.query(`
      SELECT c.challan_id, c.fine_amount, c.due_date,
             v.violation_type, veh.registration_no, vio.name AS violator_name
      FROM challans c
      JOIN violations v ON c.violation_id = v.violation_id
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      WHERE c.status = 'Unpaid'
      ORDER BY c.due_date ASC, c.created_at DESC LIMIT 6
    `);

    const [recentDisputes] = await pool.query(`
      SELECT d.dispute_id, d.reason, d.status, d.filed_date,
             c.challan_id, c.fine_amount, veh.registration_no,
             vio.name AS violator_name
      FROM disputes d
      JOIN challans c ON d.challan_id = c.challan_id
      JOIN violations v ON c.violation_id = v.violation_id
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      ORDER BY d.filed_date DESC LIMIT 6
    `);

    res.render('officer/dashboard', {
      user: req.session.user,
      stats: { ...empty, ...stats },
      recentViolations,
      recentChallans,
      pendingChallanRows,
      recentDisputes,
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.render('officer/dashboard', {
      user: req.session.user, stats: empty,
      recentViolations: [], recentChallans: [], pendingChallanRows: [], recentDisputes: [],
      error: 'Could not load officer dashboard information.',
    });
  }
});

async function renderViolationForm(res, user, data = {}) {
  const [vehicles] = await pool.query('SELECT vehicle_id, registration_no, owner_name FROM vehicles ORDER BY registration_no');
  const [violators] = await pool.query('SELECT violator_id, name, license_no FROM violators ORDER BY name');
  res.render('officer/violation-form', {
    user, vehicles, violators, types: VIOLATION_TYPES,
    violation: data.violation || null, error: data.error || null,
  });
}

router.get('/officer/violations/add', ...officerOnly, async (req, res) => {
  try {
    await renderViolationForm(res, req.session.user);
  } catch (err) {
    console.error(err);
    res.redirect('/officer/violations');
  }
});

router.post('/officer/violations/add', ...officerOnly, async (req, res) => {
  const { vehicle_id, violator_id, violation_type, location, violation_date } = req.body;
  const cleanLocation = String(location || '').trim();
  const validType = VIOLATION_TYPES.includes(violation_type);
  const connection = await pool.getConnection();

  try {
    if (!vehicle_id || !violator_id || !validType || !cleanLocation || !violation_date) {
      throw new Error('All required violation fields must be completed.');
    }

    const [vehicleRows] = await connection.query('SELECT vehicle_id FROM vehicles WHERE vehicle_id = ?', [vehicle_id]);
    const [violatorRows] = await connection.query('SELECT violator_id FROM violators WHERE violator_id = ?', [violator_id]);
    if (!vehicleRows.length || !violatorRows.length) throw new Error('Selected vehicle or violator does not exist.');

    await connection.beginTransaction();
    await connection.query(
      'INSERT INTO violations (vehicle_id, violator_id, violation_type, location, violation_date) VALUES (?, ?, ?, ?, ?)',
      [vehicle_id, violator_id, violation_type, cleanLocation, violation_date]
    );

    const points = DEMERIT_POINTS[violation_type] || 1;
    await connection.query(
      'UPDATE violators SET demerit_points = demerit_points + ? WHERE violator_id = ?',
      [points, violator_id]
    );
    await connection.query(
      "UPDATE violators SET license_status = CASE WHEN demerit_points >= ? THEN 'Flagged for Suspension' ELSE 'Active' END WHERE violator_id = ?",
      [DEMERIT_THRESHOLD, violator_id]
    );

    await connection.commit();
    res.redirect('/officer/violations');
  } catch (err) {
    try { await connection.rollback(); } catch (_) {}
    console.error(err);
    try {
      await renderViolationForm(res, req.session.user, { violation: req.body, error: err.message || 'Could not record violation.' });
    } catch (_) {
      res.redirect('/officer/violations/add');
    }
  } finally {
    connection.release();
  }
});

router.get('/officer/violations', ...officerOnly, async (req, res) => {
  const search = String(req.query.search || '').trim();
  const type = String(req.query.violation_type || '').trim();
  const from = String(req.query.from_date || '').trim();
  const to = String(req.query.to_date || '').trim();
  let query = `
    SELECT v.violation_id, v.violation_type, v.location, v.violation_date,
           veh.registration_no, vio.name AS violator_name, vio.license_no,
           c.challan_id, c.fine_amount, c.status AS challan_status
    FROM violations v
    JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
    JOIN violators vio ON v.violator_id = vio.violator_id
    LEFT JOIN challans c ON v.violation_id = c.violation_id
    WHERE 1=1`;
  const params = [];
  if (search) {
    query += ' AND (veh.registration_no LIKE ? OR vio.name LIKE ? OR vio.license_no LIKE ? OR CAST(v.violation_id AS CHAR) LIKE ? OR v.location LIKE ?)';
    const value = `%${search}%`;
    params.push(value, value, value, value, value);
  }
  if (type && VIOLATION_TYPES.includes(type)) { query += ' AND v.violation_type = ?'; params.push(type); }
  if (from) { query += ' AND v.violation_date >= ?'; params.push(`${from} 00:00:00`); }
  if (to) { query += ' AND v.violation_date <= ?'; params.push(`${to} 23:59:59`); }
  query += ' ORDER BY v.violation_date DESC';

  try {
    const [violations] = await pool.query(query, params);
    res.render('officer/violations', {
      user: req.session.user, violations, types: VIOLATION_TYPES,
      filters: { search, violation_type: type, from_date: from, to_date: to }, error: null,
    });
  } catch (err) {
    console.error(err);
    res.render('officer/violations', {
      user: req.session.user, violations: [], types: VIOLATION_TYPES,
      filters: { search, violation_type: type, from_date: from, to_date: to }, error: 'Could not load violations.',
    });
  }
});

router.get('/officer/violations/:id', ...officerOnly, async (req, res) => {
  try {
    const [[violation]] = await pool.query(`
      SELECT v.*, veh.registration_no, veh.owner_name, veh.vehicle_type, veh.model,
             vio.name AS violator_name, vio.license_no, vio.phone, vio.address,
             vio.demerit_points, vio.license_status,
             c.challan_id, c.fine_amount, c.status AS challan_status, c.due_date
      FROM violations v
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      LEFT JOIN challans c ON v.violation_id = c.violation_id
      WHERE v.violation_id = ?`, [req.params.id]);
    if (!violation) return res.redirect('/officer/violations');
    res.render('officer/violation-detail', { user: req.session.user, violation, error: null });
  } catch (err) {
    console.error(err);
    res.redirect('/officer/violations');
  }
});

router.get('/officer/challans', ...officerOnly, async (req, res) => {
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  let query = `
    SELECT c.challan_id, c.violation_id, c.fine_amount, c.status, c.due_date,
           v.violation_type, v.location, v.violation_date,
           veh.registration_no, vio.name AS violator_name, vio.license_no,
           (SELECT MAX(p.payment_date) FROM payments p WHERE p.challan_id = c.challan_id) AS payment_date,
           (SELECT COALESCE(SUM(p.amount_paid),0) FROM payments p WHERE p.challan_id = c.challan_id) AS amount_paid
    FROM challans c
    JOIN violations v ON c.violation_id = v.violation_id
    JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
    JOIN violators vio ON v.violator_id = vio.violator_id
    WHERE 1=1`;
  const params = [];
  if (search) {
    query += ' AND (CAST(c.challan_id AS CHAR) LIKE ? OR CAST(c.violation_id AS CHAR) LIKE ? OR veh.registration_no LIKE ? OR vio.name LIKE ? OR vio.license_no LIKE ?)';
    const value = `%${search}%`;
    params.push(value, value, value, value, value);
  }
  if (status && ['Paid', 'Unpaid'].includes(status)) { query += ' AND c.status = ?'; params.push(status); }
  query += ' ORDER BY c.created_at DESC';

  try {
    const [challans] = await pool.query(query, params);
    res.render('officer/challans', { user: req.session.user, challans, filters: { search, status }, error: null });
  } catch (err) {
    console.error(err);
    res.render('officer/challans', { user: req.session.user, challans: [], filters: { search, status }, error: 'Could not load challans.' });
  }
});

router.get('/officer/challans/add', ...officerOnly, async (req, res) => {
  try {
    const [violations] = await pool.query(`
      SELECT v.violation_id, v.violation_type, v.location, v.violation_date,
             veh.registration_no, vio.name AS violator_name, vio.license_no
      FROM violations v
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      LEFT JOIN challans c ON v.violation_id = c.violation_id
      WHERE c.challan_id IS NULL
      ORDER BY v.violation_date DESC`);
    res.render('officer/challan-form', { user: req.session.user, violations, rates: FINE_RATES, error: null });
  } catch (err) {
    console.error(err);
    res.redirect('/officer/challans');
  }
});

router.post('/officer/challans/add', ...officerOnly, async (req, res) => {
  const { violation_id, due_date } = req.body;
  try {
    if (!violation_id || !due_date) throw new Error('Violation and due date are required.');
    const [[row]] = await pool.query('SELECT violation_type FROM violations WHERE violation_id = ?', [violation_id]);
    if (!row) throw new Error('Violation not found.');
    const fineAmount = FINE_RATES[row.violation_type];
    if (!fineAmount) throw new Error('No fine rule exists for this violation type.');
    await pool.query('INSERT INTO challans (violation_id, fine_amount, due_date) VALUES (?, ?, ?)', [violation_id, fineAmount, due_date]);
    res.redirect('/officer/challans');
  } catch (err) {
    console.error(err);
    try {
      const [violations] = await pool.query(`
        SELECT v.violation_id, v.violation_type, v.location, v.violation_date,
               veh.registration_no, vio.name AS violator_name, vio.license_no
        FROM violations v
        JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
        JOIN violators vio ON v.violator_id = vio.violator_id
        LEFT JOIN challans c ON v.violation_id = c.violation_id
        WHERE c.challan_id IS NULL ORDER BY v.violation_date DESC`);
      res.render('officer/challan-form', { user: req.session.user, violations, rates: FINE_RATES, error: err.message || 'Could not generate challan.' });
    } catch (_) { res.redirect('/officer/challans/add'); }
  }
});

router.get('/officer/challans/:id', ...officerOnly, async (req, res) => {
  try {
    const [[challan]] = await pool.query(`
      SELECT c.*, v.violation_id, v.violation_type, v.location, v.violation_date,
             veh.registration_no, veh.owner_name, veh.vehicle_type, veh.model,
             vio.name AS violator_name, vio.license_no, vio.phone, vio.address,
             (SELECT COALESCE(SUM(p.amount_paid),0) FROM payments p WHERE p.challan_id = c.challan_id) AS amount_paid,
             (SELECT MAX(p.payment_date) FROM payments p WHERE p.challan_id = c.challan_id) AS payment_date,
             (SELECT MAX(p.payment_mode) FROM payments p WHERE p.challan_id = c.challan_id) AS payment_mode
      FROM challans c
      JOIN violations v ON c.violation_id = v.violation_id
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      WHERE c.challan_id = ?`, [req.params.id]);
    if (!challan) return res.redirect('/officer/challans');
    res.render('officer/challan-detail', { user: req.session.user, challan, error: null });
  } catch (err) {
    console.error(err);
    res.redirect('/officer/challans');
  }
});

router.get('/officer/vehicles', ...officerOnly, async (req, res) => {
  const search = String(req.query.search || '').trim();
  try {
    let query = `SELECT vehicle_id, registration_no, owner_name, vehicle_type, model FROM vehicles WHERE 1=1`;
    const params = [];
    if (search) { query += ' AND registration_no LIKE ?'; params.push(`%${search}%`); }
    query += ' ORDER BY registration_no';
    const [vehicles] = await pool.query(query, params);
    res.render('officer/vehicles', { user: req.session.user, vehicles, filters: { search }, error: null });
  } catch (err) {
    console.error(err);
    res.render('officer/vehicles', { user: req.session.user, vehicles: [], filters: { search }, error: 'Could not load vehicles.' });
  }
});

router.get('/officer/vehicles/:id', ...officerOnly, async (req, res) => {
  try {
    const [[vehicle]] = await pool.query('SELECT * FROM vehicles WHERE vehicle_id = ?', [req.params.id]);
    if (!vehicle) return res.redirect('/officer/vehicles');
    const [history] = await pool.query(`
      SELECT v.violation_id, v.violation_type, v.location, v.violation_date,
             vio.name AS violator_name, vio.license_no,
             c.challan_id, c.fine_amount, c.status AS challan_status, c.due_date
      FROM violations v
      JOIN violators vio ON v.violator_id = vio.violator_id
      LEFT JOIN challans c ON v.violation_id = c.violation_id
      WHERE v.vehicle_id = ? ORDER BY v.violation_date DESC`, [req.params.id]);
    res.render('officer/vehicle-detail', { user: req.session.user, vehicle, history, error: null });
  } catch (err) {
    console.error(err);
    res.redirect('/officer/vehicles');
  }
});

router.get('/officer/violators', ...officerOnly, async (req, res) => {
  const search = String(req.query.search || '').trim();
  try {
    let query = `SELECT violator_id, name, license_no, phone, address, demerit_points, license_status FROM violators WHERE 1=1`;
    const params = [];
    if (search) { query += ' AND (name LIKE ? OR license_no LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    query += ' ORDER BY name';
    const [violators] = await pool.query(query, params);
    res.render('officer/violators', { user: req.session.user, violators, filters: { search }, error: null });
  } catch (err) {
    console.error(err);
    res.render('officer/violators', { user: req.session.user, violators: [], filters: { search }, error: 'Could not load violators.' });
  }
});

router.get('/officer/violators/:id', ...officerOnly, async (req, res) => {
  try {
    const [[violator]] = await pool.query('SELECT * FROM violators WHERE violator_id = ?', [req.params.id]);
    if (!violator) return res.redirect('/officer/violators');
    const [history] = await pool.query(`
      SELECT v.violation_id, v.violation_type, v.location, v.violation_date,
             veh.registration_no, c.challan_id, c.fine_amount, c.status AS challan_status, c.due_date
      FROM violations v
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      LEFT JOIN challans c ON v.violation_id = c.violation_id
      WHERE v.violator_id = ? ORDER BY v.violation_date DESC`, [req.params.id]);
    res.render('officer/violator-detail', { user: req.session.user, violator, history, error: null });
  } catch (err) {
    console.error(err);
    res.redirect('/officer/violators');
  }
});

router.get('/officer/disputes', ...officerOnly, async (req, res) => {
  try {
    const [disputes] = await pool.query(`
      SELECT d.dispute_id, d.reason, d.status, d.filed_date, d.resolution_note,
             c.challan_id, c.fine_amount, c.due_date,
             v.violation_id, v.violation_type, veh.registration_no,
             vio.name AS violator_name, vio.license_no
      FROM disputes d
      JOIN challans c ON d.challan_id = c.challan_id
      JOIN violations v ON c.violation_id = v.violation_id
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      ORDER BY CASE WHEN d.status = 'Pending' THEN 0 ELSE 1 END, d.filed_date DESC`);
    res.render('officer/disputes', { user: req.session.user, disputes, error: null });
  } catch (err) {
    console.error(err);
    res.render('officer/disputes', { user: req.session.user, disputes: [], error: 'Could not load disputes.' });
  }
});

router.post('/officer/disputes/:id/remark', ...officerOnly, async (req, res) => {
  const note = String(req.body.resolution_note || '').trim();
  try {
    if (!note) throw new Error('Officer remark cannot be empty.');
    const [result] = await pool.query(
      "UPDATE disputes SET resolution_note = ? WHERE dispute_id = ? AND status = 'Pending'",
      [note, req.params.id]
    );
    if (!result.affectedRows) throw new Error('Only pending disputes can receive officer remarks.');
    res.redirect('/officer/disputes');
  } catch (err) {
    console.error(err);
    res.redirect('/officer/disputes');
  }
});

router.get('/officer/search', ...officerOnly, async (req, res) => {
  const search = String(req.query.search || '').trim();
  const type = String(req.query.violation_type || '').trim();
  try {
    let query = `
      SELECT v.violation_id, v.violation_type, v.location, v.violation_date,
             veh.registration_no, vio.name AS violator_name, vio.license_no,
             c.challan_id, c.fine_amount, c.status AS challan_status
      FROM violations v
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      LEFT JOIN challans c ON v.violation_id = c.violation_id
      WHERE 1=1`;
    const params = [];
    if (search) {
      query += ` AND (
        veh.registration_no LIKE ? OR vio.name LIKE ? OR vio.license_no LIKE ?
        OR CAST(v.violation_id AS CHAR) LIKE ? OR CAST(COALESCE(c.challan_id, 0) AS CHAR) LIKE ?
        OR v.violation_type LIKE ? OR v.location LIKE ?
      )`;
      const value = `%${search}%`;
      params.push(value, value, value, value, value, value, value);
    }
    if (type && VIOLATION_TYPES.includes(type)) { query += ' AND v.violation_type = ?'; params.push(type); }
    query += ' ORDER BY v.violation_date DESC';
    const [results] = await pool.query(query, params);
    res.render('officer/search', { user: req.session.user, results, types: VIOLATION_TYPES, filters: { search, violation_type: type }, searched: !!search || !!type, error: null });
  } catch (err) {
    console.error(err);
    res.render('officer/search', { user: req.session.user, results: [], types: VIOLATION_TYPES, filters: { search, violation_type: type }, searched: false, error: 'Search failed. Try again.' });
  }
});

module.exports = router;
