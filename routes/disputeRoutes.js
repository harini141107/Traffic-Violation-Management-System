const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireLogin, requireRole } = require('../middleware/auth');

// GET all disputes — Violators see only their own
router.get('/disputes', requireLogin, requireRole(['admin', 'violator']), async (req, res) => {
  try {
    let query = `
      SELECT d.dispute_id, d.reason, d.status, d.filed_date, d.resolution_note,
             c.challan_id, c.fine_amount,
             v.violation_type, v.violator_id, veh.registration_no, vio.name AS violator_name
      FROM disputes d
      JOIN challans c ON d.challan_id = c.challan_id
      JOIN violations v ON c.violation_id = v.violation_id
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
    `;
    const params = [];

    if (req.session.user.role === 'violator') {
      query += ' WHERE v.violator_id = ?';
      params.push(req.session.user.violator_id);
    }

    query += ' ORDER BY d.filed_date DESC';

    const [disputes] = await pool.query(query, params);
    res.render('disputes', { disputes, user: req.session.user, error: null });
  } catch (err) {
    console.error(err);
    res.render('disputes', { disputes: [], user: req.session.user, error: 'Could not load disputes.' });
  }
});

// GET file dispute form — Violators only see their own eligible challans
router.get('/disputes/add', requireLogin, requireRole(['violator']), async (req, res) => {
  try {
    let query = `
      SELECT c.challan_id, c.fine_amount, v.violation_type, v.violator_id,
             veh.registration_no, vio.name AS violator_name
      FROM challans c
      JOIN violations v ON c.violation_id = v.violation_id
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      LEFT JOIN disputes d ON c.challan_id = d.challan_id
      WHERE d.dispute_id IS NULL
    `;
    const params = [];

    if (req.session.user.role === 'violator') {
      query += ' AND v.violator_id = ?';
      params.push(req.session.user.violator_id);
    }

    query += ' ORDER BY c.created_at DESC';

    const [challans] = await pool.query(query, params);
    res.render('dispute-form', { user: req.session.user, challans, error: null });
  } catch (err) {
    console.error(err);
    res.redirect('/disputes');
  }
});

// POST file dispute — with ownership check for Violators
router.post('/disputes/add', requireLogin, requireRole(['violator']), async (req, res) => {
  const { challan_id, reason } = req.body;
  try {
    if (req.session.user.role === 'violator') {
      const [rows] = await pool.query(`
        SELECT v.violator_id FROM challans c
        JOIN violations v ON c.violation_id = v.violation_id
        WHERE c.challan_id = ?
      `, [challan_id]);

      if (rows.length === 0 || rows[0].violator_id !== req.session.user.violator_id) {
        return res.status(403).send('Access denied. This challan does not belong to your account.');
      }
    }

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

// POST resolve dispute — admin/officer only
router.post('/disputes/resolve/:id', requireLogin, requireRole(['admin']), async (req, res) => {
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