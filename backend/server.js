const express = require('express');
const cors = require('cors');

const networkRoutes = require('./routes/network');
const { triggerBackgroundWakeup } = require('./services/mockML');

const app = express();
const PORT = process.env.PORT || 4000;

// ----------------------------------------------------------------
// Middleware (Production + Local CORS)
// ----------------------------------------------------------------
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server / health checks (no origin), explicit origins, and Vercel/Render deployments
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.onrender.com')
    ) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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

  // Proactively wake up the FastAPI ML container on backend startup
  triggerBackgroundWakeup();
});
