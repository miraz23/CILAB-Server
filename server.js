require('dotenv').config();
const express = require('express');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const accessRequestRoutes = require('./routes/accessRequestRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const publicScheduleRoutes = require('./routes/publicScheduleRoutes');
const researchRoutes = require('./routes/researchRoutes');
const memberRoutes = require('./routes/memberRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const publicAnnouncementRoutes = require('./routes/publicAnnouncementRoutes');
const errorHandler = require('./middleware/errorHandler');
const { initializeDb } = require('./config/db');

const cors = require('cors');
const app = express();
const PORT = process.env.PORT;
let dbInitialization;

const allowedOrigins = new Set(
  (process.env.CORS_ORIGIN || 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return callback(null, true);
      }
    } catch {
      return callback(new Error('Invalid request origin.'));
    }

    return callback(new Error('Origin is not allowed by CORS.'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204,
}));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Server is up and running!' });
});

app.use('/api', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/schedule', publicScheduleRoutes);
app.use('/api/research', researchRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/announcements', publicAnnouncementRoutes);
app.use('/api', uploadRoutes);
app.use('/api/access-requests', accessRequestRoutes);
app.use('/api/admin/schedule', scheduleRoutes);
app.use('/api/admin/announcements', announcementRoutes);
app.use(errorHandler);

function ensureDbInitialized() {
  if (!dbInitialization) {
    dbInitialization = initializeDb().catch((err) => {
      dbInitialization = undefined;
      throw err;
    });
  }

  return dbInitialization;
}

if (require.main === module) {
  ensureDbInitialized()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server listening at http://localhost:${PORT}`);
      });
    })
    .catch(err => {
      console.error('Failed to initialize database:', err);
      process.exit(1);
    });
}

module.exports = async function handler(req, res) {
  try {
    await ensureDbInitialized();
    return app(req, res);
  } catch (err) {
    console.error('Failed to initialize database:', err);
    return res.status(500).json({
      success: false,
      message: 'Service temporarily unavailable.',
    });
  }
};