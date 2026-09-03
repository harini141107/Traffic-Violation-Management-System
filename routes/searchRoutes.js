const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireLogin, requireRole } = require('../middleware/auth');

router.get('/search', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  const { registration_no, violator_name, violation_type, from_date, to_date } = req.query;

  let query = `
    SELECT v.violation_id, v.violation_type, v.location, v.violation_date,
           veh.registration_no, vio.name AS violator_name
    FROM violations v
    JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
    JOIN violators vio ON v.violator_id = vio.violator_id
    WHERE 1=1
  `;
  const params = [];

  if (registration_no) {
    query += ' AND veh.registration_no LIKE ?';
    params.push(`%${registration_no}%`);
  }
  if (violator_name) {
    query += ' AND vio.name LIKE ?';
    params.push(`%${violator_name}%`);
  }
  if (violation_type) {
    query += ' AND v.violation_type = ?';
    params.push(violation_type);
  }
  if (from_date) {
    query += ' AND v.violation_date >= ?';
    params.push(from_date);
  }
  if (to_date) {
    query += ' AND v.violation_date <= ?';
    params.push(to_date);
  }

  query += ' ORDER BY v.violation_date DESC';

  const VIOLATION_TYPES = [
    'Signal Jumping', 'No Helmet', 'Triple Riding', 'Wrong Side Driving',
    'Speeding', 'No Seatbelt', 'Illegal Parking', 'Driving Without License'
  ];

  try {
    const [results] = await pool.query(query, params);
    res.render('search', {
      user: req.session.user,
      results,
      types: VIOLATION_TYPES,
      filters: req.query,
      searched: Object.keys(req.query).length > 0,
      error: null,
    });
  } catch (err) {
    console.error(err);
    res.render('search', {
      user: req.session.user,
      results: [],
      types: VIOLATION_TYPES,
      filters: {},
      searched: false,
      error: 'Search failed. Try again.',
    });
  }
});

module.exports = router;