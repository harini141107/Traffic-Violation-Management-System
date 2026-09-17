const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireLogin, requireRole } = require('../middleware/auth');

const VIOLATION_TYPES = [
  'Signal Jumping', 'No Helmet', 'Triple Riding', 'Wrong Side Driving',
  'Speeding', 'No Seatbelt', 'Illegal Parking', 'Driving Without License'
];

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

const DEMERIT_THRESHOLD = 12;

router.get('/violations', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const [violations] = await pool.query(`
      SELECT v.violation_id, v.violation_type, v.location, v.violation_date,
             veh.registration_no, vio.name AS violator_name
      FROM violations v
      JOIN vehicles veh ON v.vehicle_id = veh.vehicle_id
      JOIN violators vio ON v.violator_id = vio.violator_id
      ORDER BY v.violation_date DESC
    `);
    res.render('violations', { violations, user: req.session.user, error: null });
  } catch (err) {
    console.error(err);
    res.render('violations', { violations: [], user: req.session.user, error: 'Could not load violations.' });
  }
});

router.get('/violations/add', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const [vehicles] = await pool.query('SELECT vehicle_id, registration_no FROM vehicles ORDER BY registration_no');
    const [violators] = await pool.query('SELECT violator_id, name, license_no FROM violators ORDER BY name');
    res.render('violation-form', {
      user: req.session.user, vehicles, violators, types: VIOLATION_TYPES,
      violation: null, error: null, mode: 'add',
    });
  } catch (err) {
    console.error(err);
    res.redirect('/violations');
  }
});

router.post('/violations/add', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  const { vehicle_id, violator_id, violation_type, location, violation_date } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      'INSERT INTO violations (vehicle_id, violator_id, violation_type, location, violation_date) VALUES (?, ?, ?, ?, ?)',
      [vehicle_id, violator_id, violation_type, location, violation_date]
    );

    const points = DEMERIT_POINTS[violation_type] || 1;

    await connection.query(
      'UPDATE violators SET demerit_points = demerit_points + ? WHERE violator_id = ?',
      [points, violator_id]
    );

    const [[violator]] = await connection.query(
      'SELECT demerit_points FROM violators WHERE violator_id = ?', [violator_id]
    );

    if (violator.demerit_points >= DEMERIT_THRESHOLD) {
      await connection.query(
        "UPDATE violators SET license_status = 'Flagged for Suspension' WHERE violator_id = ?",
        [violator_id]
      );
    }

    await connection.commit();
    res.redirect('/violations');
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.redirect('/violations/add');
  } finally {
    connection.release();
  }
});

router.get('/violations/edit/:id', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM violations WHERE violation_id = ?', [req.params.id]);
    if (rows.length === 0) return res.redirect('/violations');
    const [vehicles] = await pool.query('SELECT vehicle_id, registration_no FROM vehicles ORDER BY registration_no');
    const [violators] = await pool.query('SELECT violator_id, name, license_no FROM violators ORDER BY name');
    res.render('violation-form', {
      user: req.session.user, vehicles, violators, types: VIOLATION_TYPES,
      violation: rows[0], error: null, mode: 'edit',
    });
  } catch (err) {
    console.error(err);
    res.redirect('/violations');
  }
});

router.post('/violations/edit/:id', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  const { vehicle_id, violator_id, violation_type, location, violation_date } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [oldRows] = await connection.query(
      'SELECT violator_id, violation_type FROM violations WHERE violation_id = ? FOR UPDATE',
      [req.params.id]
    );
    if (oldRows.length === 0) {
      await connection.rollback();
      return res.redirect('/violations');
    }

    const oldViolation = oldRows[0];
    const oldPoints = DEMERIT_POINTS[oldViolation.violation_type] || 1;
    const newPoints = DEMERIT_POINTS[violation_type] || 1;

    await connection.query(
      'UPDATE violations SET vehicle_id = ?, violator_id = ?, violation_type = ?, location = ?, violation_date = ? WHERE violation_id = ?',
      [vehicle_id, violator_id, violation_type, location, violation_date, req.params.id]
    );

    if (Number(oldViolation.violator_id) === Number(violator_id)) {
      const delta = newPoints - oldPoints;
      if (delta !== 0) {
        await connection.query(
          'UPDATE violators SET demerit_points = GREATEST(0, demerit_points + ?) WHERE violator_id = ?',
          [delta, violator_id]
        );
      }
    } else {
      await connection.query(
        'UPDATE violators SET demerit_points = GREATEST(0, demerit_points - ?) WHERE violator_id = ?',
        [oldPoints, oldViolation.violator_id]
      );
      await connection.query(
        'UPDATE violators SET demerit_points = demerit_points + ? WHERE violator_id = ?',
        [newPoints, violator_id]
      );
    }

    const affectedIds = [oldViolation.violator_id, violator_id];
    for (const id of affectedIds) {
      const [[row]] = await connection.query(
        'SELECT demerit_points FROM violators WHERE violator_id = ?', [id]
      );
      if (row) {
        await connection.query(
          "UPDATE violators SET license_status = CASE WHEN demerit_points >= ? THEN 'Flagged for Suspension' ELSE 'Active' END WHERE violator_id = ?",
          [DEMERIT_THRESHOLD, id]
        );
      }
    }

    await connection.commit();
    res.redirect('/violations');
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.redirect('/violations');
  } finally {
    connection.release();
  }
});

router.post('/violations/delete/:id', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      'SELECT violator_id, violation_type FROM violations WHERE violation_id = ? FOR UPDATE',
      [req.params.id]
    );
    if (rows.length === 0) {
      await connection.rollback();
      return res.redirect('/violations');
    }

    const points = DEMERIT_POINTS[rows[0].violation_type] || 1;
    const violatorId = rows[0].violator_id;

    await connection.query('DELETE FROM violations WHERE violation_id = ?', [req.params.id]);
    await connection.query(
      'UPDATE violators SET demerit_points = GREATEST(0, demerit_points - ?), license_status = CASE WHEN GREATEST(0, demerit_points - ?) >= ? THEN \'Flagged for Suspension\' ELSE \'Active\' END WHERE violator_id = ?',
      [points, points, DEMERIT_THRESHOLD, violatorId]
    );

    await connection.commit();
    res.redirect('/violations');
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.redirect('/violations');
  } finally {
    connection.release();
  }
});

module.exports = router;