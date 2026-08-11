const express = require('express');
const session = require('express-session');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const violatorRoutes = require('./routes/violatorRoutes');
const violationRoutes = require('./routes/violationRoutes');
const searchRoutes = require('./routes/searchRoutes');

const app = express();

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/', searchRoutes);

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 }, // 1 hour
  })
);

app.get('/', (req, res) => res.redirect('/login'));

app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/', vehicleRoutes);
app.use('/', violatorRoutes);
app.use('/', violationRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
