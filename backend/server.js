const express = require('express');
const cors = require('cors');

const networkRoutes = require('./routes/network');

const app = express();
const PORT = process.env.PORT || 4000;

// ----------------------------------------------------------------
// Middleware
// ----------------------------------------------------------------
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// ----------------------------------------------------------------
// Routes
// ----------------------------------------------------------------
app.use('/api', networkRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'NDT Backend',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// ----------------------------------------------------------------
// Start
// ----------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`\n🚀 NDT Backend running at http://localhost:${PORT}`);
  console.log(`   Health:   GET  /health`);
  console.log(`   Topology: GET  /api/network`);
  console.log(`   Analyze:  POST /api/analyze`);
  console.log(`   Fault:    POST /api/fault`);
  console.log(`   Reset:    POST /api/reset\n`);
});
