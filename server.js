const express = require('express');
const session = require('express-session');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');

const app = express();

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
