const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireLogin } = require('../middleware/auth');

router.get('/payments/pay/:challanId', requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.challan_id, c.fine_amount, c.status,
             v.violation_type, veh.registration_no, vio.name AS violator_name
      FROM challans c
      JOIN violations v ON c.violation_id = v.violation_id
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      WHERE c.challan_id = ?
    `, [req.params.challanId]);

    if (rows.length === 0) return res.redirect('/challans');
    if (rows[0].status === 'Paid') return res.redirect('/challans');

    res.render('payment-form', { user: req.session.user, challan: rows[0], error: null });
  } catch (err) {
    console.error(err);
    res.redirect('/challans');
  }
});

router.post('/payments/pay/:challanId', requireLogin, async (req, res) => {
  const { amount_paid, payment_mode } = req.body;
  const challanId = req.params.challanId;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      'INSERT INTO payments (challan_id, amount_paid, payment_mode) VALUES (?, ?, ?)',
      [challanId, amount_paid, payment_mode]
    );

    await connection.query(
      "UPDATE challans SET status = 'Paid' WHERE challan_id = ?",
      [challanId]
    );

    await connection.commit();
    res.redirect('/payments/receipt/' + challanId);
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.redirect('/payments/pay/' + challanId);
  } finally {
    connection.release();
  }
});

router.get('/payments/receipt/:challanId', requireLogin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.amount_paid, p.payment_mode, p.payment_date,
             c.challan_id, c.fine_amount,
             v.violation_type, veh.registration_no, vio.name AS violator_name
      FROM payments p
      JOIN challans c ON p.challan_id = c.challan_id
      JOIN violations v ON c.violation_id = v.violation_id
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      WHERE c.challan_id = ?
      ORDER BY p.payment_date DESC
      LIMIT 1
    `, [req.params.challanId]);

    if (rows.length === 0) return res.redirect('/challans');
    res.render('receipt', { user: req.session.user, payment: rows[0] });
  } catch (err) {
    console.error(err);
    res.redirect('/challans');
  }
});

module.exports = router;