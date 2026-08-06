require('dotenv').config();
const express = require('express');
const authRoutes = require('./routes/authRoutes');
const errorHandler = require('./middleware/errorHandler');
const { initializeDb } = require('./config/db');

const cors = require('cors');
const app = express();
const PORT = process.env.PORT;

app.use(cors({ origin: process.env.CORS_ORIGIN }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: 'Server is up and running!' });
});

app.use('/api', authRoutes);
app.use(errorHandler);

initializeDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server listening at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });