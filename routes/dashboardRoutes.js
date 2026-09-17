const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireLogin } = require('../middleware/auth');

router.get('/dashboard', requireLogin, async (req, res) => {
  const user = req.session.user;
  const empty = {
    totalVehicles: 0, totalViolators: 0, totalViolations: 0,
    totalChallans: 0, pendingChallans: 0, paidChallans: 0,
    totalCollected: 0, pendingDisputes: 0, flaggedLicenses: 0,
    recentViolations: [],
  };

  try {
    if (user.role === 'violator') {
      const id = user.violator_id;
      if (!id) return res.render('dashboard', { user, stats: empty });

      const [[stats]] = await pool.query(`
        SELECT
          (SELECT COUNT(DISTINCT ve.vehicle_id) FROM vehicles ve
             JOIN violations vx ON ve.vehicle_id = vx.vehicle_id
             WHERE vx.violator_id = ?) AS totalVehicles,
          (SELECT COUNT(*) FROM violations WHERE violator_id = ?) AS totalViolations,
          (SELECT COUNT(*) FROM challans c JOIN violations v ON c.violation_id = v.violation_id
             WHERE v.violator_id = ?) AS totalChallans,
          (SELECT COUNT(*) FROM challans c JOIN violations v ON c.violation_id = v.violation_id
             WHERE v.violator_id = ? AND c.status = 'Unpaid') AS pendingChallans,
          (SELECT COUNT(*) FROM challans c JOIN violations v ON c.violation_id = v.violation_id
             WHERE v.violator_id = ? AND c.status = 'Paid') AS paidChallans,
          (SELECT COALESCE(SUM(p.amount_paid),0) FROM payments p
             JOIN challans c ON p.challan_id = c.challan_id
             JOIN violations v ON c.violation_id = v.violation_id
             WHERE v.violator_id = ?) AS totalCollected,
          (SELECT COUNT(*) FROM disputes d JOIN challans c ON d.challan_id = c.challan_id
             JOIN violations v ON c.violation_id = v.violation_id
             WHERE v.violator_id = ? AND d.status = 'Pending') AS pendingDisputes
      `, [id,id,id,id,id,id,id]);

      const [recentViolations] = await pool.query(`
        SELECT v.violation_type, v.location, v.violation_date, veh.registration_no
        FROM violations v
        JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
        WHERE v.violator_id = ?
        ORDER BY v.violation_date DESC LIMIT 5
      `, [id]);

      return res.render('dashboard', { user, stats: { ...empty, ...stats, totalViolators: 1, recentViolations } });
    }

    const [[stats]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM vehicles) AS totalVehicles,
        (SELECT COUNT(*) FROM violators) AS totalViolators,
        (SELECT COUNT(*) FROM violations) AS totalViolations,
        (SELECT COUNT(*) FROM challans) AS totalChallans,
        (SELECT COUNT(*) FROM challans WHERE status='Unpaid') AS pendingChallans,
        (SELECT COUNT(*) FROM challans WHERE status='Paid') AS paidChallans,
        (SELECT COALESCE(SUM(amount_paid),0) FROM payments) AS totalCollected,
        (SELECT COUNT(*) FROM disputes WHERE status='Pending') AS pendingDisputes,
        (SELECT COUNT(*) FROM violators WHERE license_status='Flagged for Suspension') AS flaggedLicenses
    `);
    const [recentViolations] = await pool.query(`
      SELECT v.violation_type, v.location, v.violation_date,
             veh.registration_no, vio.name AS violator_name
      FROM violations v
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      ORDER BY v.violation_date DESC LIMIT 5
    `);

    res.render('dashboard', { user, stats: { ...empty, ...stats, recentViolations } });
  } catch (err) {
    console.error(err);
    res.render('dashboard', { user, stats: empty, error: 'Could not load dashboard statistics.' });
  }
});

module.exports = router;
