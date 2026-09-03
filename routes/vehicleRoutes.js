const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireLogin, requireRole } = require('../middleware/auth');

router.get('/vehicles', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const [vehicles] = await pool.query('SELECT * FROM vehicles ORDER BY created_at DESC');
    res.render('vehicles', { vehicles, user: req.session.user, error: null });
  } catch (err) {
    console.error(err);
    res.render('vehicles', { vehicles: [], user: req.session.user, error: 'Could not load vehicles.' });
  }
});

router.get('/vehicles/add', requireLogin, requireRole(['admin', 'officer']), (req, res) => {
  res.render('vehicle-form', { user: req.session.user, vehicle: null, error: null, mode: 'add' });
});

router.post('/vehicles/add', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  const { registration_no, owner_name, vehicle_type, model } = req.body;
  try {
    await pool.query(
      'INSERT INTO vehicles (registration_no, owner_name, vehicle_type, model) VALUES (?, ?, ?, ?)',
      [registration_no, owner_name, vehicle_type, model]
    );
    res.redirect('/vehicles');
  } catch (err) {
    console.error(err);
    res.render('vehicle-form', {
      user: req.session.user,
      vehicle: req.body,
      error: 'Registration number already exists or input is invalid.',
      mode: 'add',
    });
  }
});

router.get('/vehicles/edit/:id', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM vehicles WHERE vehicle_id = ?', [req.params.id]);
    if (rows.length === 0) return res.redirect('/vehicles');
    res.render('vehicle-form', { user: req.session.user, vehicle: rows[0], error: null, mode: 'edit' });
  } catch (err) {
    console.error(err);
    res.redirect('/vehicles');
  }
});

router.post('/vehicles/edit/:id', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  const { registration_no, owner_name, vehicle_type, model } = req.body;
  try {
    await pool.query(
      'UPDATE vehicles SET registration_no = ?, owner_name = ?, vehicle_type = ?, model = ? WHERE vehicle_id = ?',
      [registration_no, owner_name, vehicle_type, model, req.params.id]
    );
    res.redirect('/vehicles');
  } catch (err) {
    console.error(err);
    res.render('vehicle-form', {
      user: req.session.user,
      vehicle: { ...req.body, vehicle_id: req.params.id },
      error: 'Update failed. Registration number may already be in use.',
      mode: 'edit',
    });
  }
});

router.post('/vehicles/delete/:id', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    await pool.query('DELETE FROM vehicles WHERE vehicle_id = ?', [req.params.id]);
    res.redirect('/vehicles');
  } catch (err) {
    console.error(err);
    res.redirect('/vehicles');
  }
});

module.exports = router;