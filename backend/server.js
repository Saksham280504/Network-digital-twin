const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'Backend is running' });
});

// Mock endpoint for ML Engine prediction (Phase 2)
// Once the DA/DS finishes the ML Engine, we will replace this with an actual HTTP request
app.post('/api/mock-predict-congestion', (req, res) => {
  const { edges } = req.body;
  
  if (!edges || !Array.isArray(edges)) {
    return res.status(400).json({ error: 'Invalid payload. Expected an array of edges.' });
  }

  // Generate mock predictions
  const predictions = edges.map(edge => {
    // Simple mock logic: randomly assign a congestion status
    const statuses = ['Highly Congested', 'Moderately Congested', 'Balanced', 'Uncongested'];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    const randomProbability = parseFloat(Math.random().toFixed(2));

    return {
      edge_id: edge.id,
      congestion_status: randomStatus,
      probability: randomProbability
    };
  });

  // Small delay to simulate network latency
  setTimeout(() => {
    res.json({ predictions });
  }, 500);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
