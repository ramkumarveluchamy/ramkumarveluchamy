const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { JWT_SECRET } = require('../middleware/auth');

// Check if user exists (first-time setup detection)
router.get('/status', (req, res) => {
  const user = db.prepare('SELECT id FROM users LIMIT 1').get();
  res.json({ hasUser: !!user });
});

// Setup PIN (first time)
router.post('/setup', (req, res) => {
  const existing = db.prepare('SELECT id FROM users LIMIT 1').get();
  if (existing) {
    return res.status(400).json({ error: 'User already exists' });
  }
  const { pin } = req.body;
  if (!pin || pin.length < 4) {
    return res.status(400).json({ error: 'PIN must be at least 4 characters' });
  }
  const pin_hash = bcrypt.hashSync(pin, 10);
  db.prepare('INSERT INTO users (pin_hash) VALUES (?)').run(pin_hash);
  const token = jwt.sign({ userId: 1 }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, message: 'PIN set successfully' });
});

// Login
router.post('/login', (req, res) => {
  const { pin } = req.body;
  const user = db.prepare('SELECT * FROM users LIMIT 1').get();
  if (!user) {
    return res.status(404).json({ error: 'No user found. Please set up your PIN first.' });
  }
  if (!bcrypt.compareSync(pin, user.pin_hash)) {
    return res.status(401).json({ error: 'Incorrect PIN' });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// Change PIN
router.post('/change-pin', require('../middleware/auth').authenticate, (req, res) => {
  const { currentPin, newPin } = req.body;
  const user = db.prepare('SELECT * FROM users LIMIT 1').get();
  if (!bcrypt.compareSync(currentPin, user.pin_hash)) {
    return res.status(401).json({ error: 'Current PIN is incorrect' });
  }
  if (!newPin || newPin.length < 4) {
    return res.status(400).json({ error: 'New PIN must be at least 4 characters' });
  }
  const pin_hash = bcrypt.hashSync(newPin, 10);
  db.prepare('UPDATE users SET pin_hash = ? WHERE id = ?').run(pin_hash, user.id);
  res.json({ message: 'PIN changed successfully' });
});

module.exports = router;
