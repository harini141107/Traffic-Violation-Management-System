const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireLogin, requireRole } = require('../middleware/auth');

// Fixed fine amounts per violation type
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

// GET all challans (list view) — everyone logged in can see this
router.get('/challans', requireLogin, async (req, res) => {
  try {
    const [challans] = await pool.query(`
      SELECT c.challan_id, c.fine_amount, c.status, c.due_date,
             v.violation_type, v.location, v.violation_date,
             veh.registration_no, vio.name AS violator_name
      FROM challans c
      JOIN violations v ON c.violation_id = v.violation_id
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      ORDER BY c.created_at DESC
    `);
    res.render('challans', { challans, user: req.session.user, error: null });
  } catch (err) {
    console.error(err);
    res.render('challans', { challans: [], user: req.session.user, error: 'Could not load challans.' });
  }
});

// GET generate challan form — admin/officer only
router.get('/challans/add', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const [violations] = await pool.query(`
      SELECT v.violation_id, v.violation_type, v.location, v.violation_date,
             veh.registration_no, vio.name AS violator_name
      FROM violations v
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      LEFT JOIN challans c ON v.violation_id = c.violation_id
      WHERE c.challan_id IS NULL
      ORDER BY v.violation_date DESC
    `);
    res.render('challan-form', { user: req.session.user, violations, error: null });
  } catch (err) {
    console.error(err);
    res.redirect('/challans');
  }
});

// POST generate challan — admin/officer only
router.post('/challans/add', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  const { violation_id, due_date } = req.body;
  try {
    const [rows] = await pool.query('SELECT violation_type FROM violations WHERE violation_id = ?', [violation_id]);
    if (rows.length === 0) return res.redirect('/challans/add');

    const fineAmount = FINE_RATES[rows[0].violation_type] || 500;

    await pool.query(
      'INSERT INTO challans (violation_id, fine_amount, due_date) VALUES (?, ?, ?)',
      [violation_id, fineAmount, due_date]
    );
    res.redirect('/challans');
  } catch (err) {
    console.error(err);
    res.redirect('/challans/add');
  }
});

// POST delete challan — admin/officer only
router.post('/challans/delete/:id', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    await pool.query('DELETE FROM challans WHERE challan_id = ?', [req.params.id]);
    res.redirect('/challans');
  } catch (err) {
    console.error(err);
    res.redirect('/challans');
  }
});

module.exports = router;