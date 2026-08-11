const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireLogin } = require('../middleware/auth');

router.get('/reports', requireLogin, async (req, res) => {
  try {
    const [[{ totalVehicles }]] = await pool.query('SELECT COUNT(*) AS totalVehicles FROM vehicles');
    const [[{ totalViolators }]] = await pool.query('SELECT COUNT(*) AS totalViolators FROM violators');
    const [[{ totalViolations }]] = await pool.query('SELECT COUNT(*) AS totalViolations FROM violations');

    const [byType] = await pool.query(`
      SELECT violation_type, COUNT(*) AS count
      FROM violations
      GROUP BY violation_type
      ORDER BY count DESC
    `);

    const [recent] = await pool.query(`
      SELECT v.violation_type, v.location, v.violation_date,
             veh.registration_no, vio.name AS violator_name
      FROM violations v
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      ORDER BY v.violation_date DESC
      LIMIT 5
    `);

    res.render('reports', {
      user: req.session.user,
      totalVehicles,
      totalViolators,
      totalViolations,
      byType,
      recent,
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.render('reports', {
      user: req.session.user,
      totalVehicles: 0,
      totalViolators: 0,
      totalViolations: 0,
      byType: [],
      recent: [],
      error: 'Could not load reports.',
    });
  }
});

module.exports = router;