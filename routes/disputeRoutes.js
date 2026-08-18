const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireLogin } = require('../middleware/auth');

// GET all disputes (list view)
router.get('/disputes', requireLogin, async (req, res) => {
  try {
    const [disputes] = await pool.query(`
      SELECT d.dispute_id, d.reason, d.status, d.filed_date, d.resolution_note,
             c.challan_id, c.fine_amount,
             v.violation_type, veh.registration_no, vio.name AS violator_name
      FROM disputes d
      JOIN challans c ON d.challan_id = c.challan_id
      JOIN violations v ON c.violation_id = v.violation_id
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      ORDER BY d.filed_date DESC
    `);
    res.render('disputes', { disputes, user: req.session.user, error: null });
  } catch (err) {
    console.error(err);
    res.render('disputes', { disputes: [], user: req.session.user, error: 'Could not load disputes.' });
  }
});

// GET file dispute form — only shows challans without an existing dispute
router.get('/disputes/add', requireLogin, async (req, res) => {
  try {
    const [challans] = await pool.query(`
      SELECT c.challan_id, c.fine_amount, v.violation_type,
             veh.registration_no, vio.name AS violator_name
      FROM challans c
      JOIN violations v ON c.violation_id = v.violation_id
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      LEFT JOIN disputes d ON c.challan_id = d.challan_id
      WHERE d.dispute_id IS NULL
      ORDER BY c.created_at DESC
    `);
    res.render('dispute-form', { user: req.session.user, challans, error: null });
  } catch (err) {
    console.error(err);
    res.redirect('/disputes');
  }
});

// POST file dispute
router.post('/disputes/add', requireLogin, async (req, res) => {
  const { challan_id, reason } = req.body;
  try {
    await pool.query(
      'INSERT INTO disputes (challan_id, reason) VALUES (?, ?)',
      [challan_id, reason]
    );
    res.redirect('/disputes');
  } catch (err) {
    console.error(err);
    res.redirect('/disputes/add');
  }
});

// POST resolve dispute (Upheld or Dismissed)
router.post('/disputes/resolve/:id', requireLogin, async (req, res) => {
  const { status, resolution_note } = req.body;
  try {
    await pool.query(
      'UPDATE disputes SET status = ?, resolution_note = ?, resolved_date = NOW() WHERE dispute_id = ?',
      [status, resolution_note, req.params.id]
    );
    res.redirect('/disputes');
  } catch (err) {
    console.error(err);
    res.redirect('/disputes');
  }
});

module.exports = router;