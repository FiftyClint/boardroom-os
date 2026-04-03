require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Static files
app.use(express.static(path.join(__dirname, '../client')));

// Routes
const authRoutes = require('./routes/auth');
const boardRoutes = require('./routes/board');
const sessionsRoutes = require('./routes/sessions');
const documentsRoutes = require('./routes/documents');
const contextRoutes = require('./routes/context');

app.use('/api/auth', authRoutes);
app.use('/api/board', boardRoutes);
app.use('/api/sessions', sessionsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/context', contextRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Fallback for SPA (if needed)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
