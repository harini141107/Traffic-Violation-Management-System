const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { requireLogin, requireRole } = require('../middleware/auth');

router.get('/violators', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const [violators] = await pool.query('SELECT * FROM violators ORDER BY created_at DESC');
    res.render('violators', { violators, user: req.session.user, error: null });
  } catch (err) {
    console.error(err);
    res.render('violators', { violators: [], user: req.session.user, error: 'Could not load violators.' });
  }
});

router.get('/violators/add', requireLogin, requireRole(['admin', 'officer']), (req, res) => {
  res.render('violator-form', { user: req.session.user, violator: null, error: null, mode: 'add' });
});

router.post('/violators/add', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  const { name, license_no, phone, address } = req.body;
  try {
    await pool.query(
      'INSERT INTO violators (name, license_no, phone, address) VALUES (?, ?, ?, ?)',
      [name, license_no, phone, address]
    );
    res.redirect('/violators');
  } catch (err) {
    console.error(err);
    res.render('violator-form', {
      user: req.session.user,
      violator: req.body,
      error: 'License number already exists or input is invalid.',
      mode: 'add',
    });
  }
});

router.get('/violators/edit/:id', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM violators WHERE violator_id = ?', [req.params.id]);
    if (rows.length === 0) return res.redirect('/violators');
    res.render('violator-form', { user: req.session.user, violator: rows[0], error: null, mode: 'edit' });
  } catch (err) {
    console.error(err);
    res.redirect('/violators');
  }
});

router.post('/violators/edit/:id', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  const { name, license_no, phone, address } = req.body;
  try {
    await pool.query(
      'UPDATE violators SET name = ?, license_no = ?, phone = ?, address = ? WHERE violator_id = ?',
      [name, license_no, phone, address, req.params.id]
    );
    res.redirect('/violators');
  } catch (err) {
    console.error(err);
    res.render('violator-form', {
      user: req.session.user,
      violator: { ...req.body, violator_id: req.params.id },
      error: 'Update failed. License number may already be in use.',
      mode: 'edit',
    });
  }
});

router.post('/violators/delete/:id', requireLogin, requireRole(['admin', 'officer']), async (req, res) => {
  try {
    await pool.query('DELETE FROM violators WHERE violator_id = ?', [req.params.id]);
    res.redirect('/violators');
  } catch (err) {
    console.error(err);
    res.redirect('/violators');
  }
});

module.exports = router;