const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const pool = require('../config/db');

// GET register page
router.get('/register', (req, res) => {
  res.render('register', { error: null });
});

// POST register
router.post('/register', async (req, res) => {
  const { username, password, role, name, license_no, phone, address } = req.body;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let violatorId = null;

    if (role === 'violator') {
      if (!name || !license_no) {
        await connection.rollback();
        return res.render('register', { error: 'Full Name and License Number are required for a Violator account.' });
      }

      const [existing] = await connection.query(
        'SELECT violator_id FROM violators WHERE license_no = ?', [license_no]
      );

      if (existing.length > 0) {
        violatorId = existing[0].violator_id;
      } else {
        const [result] = await connection.query(
          'INSERT INTO violators (name, license_no, phone, address) VALUES (?, ?, ?, ?)',
          [name, license_no, phone || null, address || null]
        );
        violatorId = result.insertId;
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await connection.query(
      'INSERT INTO users (username, password, role, violator_id) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, role || 'officer', violatorId]
    );

    await connection.commit();
    res.redirect('/login');
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.render('register', { error: 'Username already exists or input is invalid.' });
  } finally {
    connection.release();
  }
});

// GET login page
router.get('/login', (req, res) => {
  const role = req.query.role || 'officer';
  res.render('login', { error: null, role });
});

// POST login
router.post('/login', async (req, res) => {
  const { username, password, role } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    if (rows.length === 0) {
      return res.render('login', { error: 'Invalid username or password.', role });
    }

    const user = rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.render('login', { error: 'Invalid username or password.', role });
    }

    if (user.role !== role) {
      return res.render('login', {
        error: `This account is registered as "${user.role}", not "${role}". Please select the correct login type.`,
        role,
      });
    }

    req.session.user = {
      id: user.user_id,
      username: user.username,
      role: user.role,
      violator_id: user.violator_id || null,
    };
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.render('login', { error: 'Something went wrong. Please try again.', role });
  }
});

// GET logout
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error(err);
    res.redirect('/login');
  });
});

module.exports = router;