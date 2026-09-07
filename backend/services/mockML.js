/**
 * PLUGIN POINT: ML Engine Integration
 * =====================================
 * This file is the ONLY file that needs to change when the DA/DS team
 * completes the FastAPI ML engine.
 *
 * To connect the real ML engine:
 *   1. Install axios: npm install axios
 *   2. Replace the function body with:
 *
 *      const axios = require('axios');
 *      const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://localhost:8000/predict-congestion';
 *
 *      async function predictCongestion(edges) {
 *        const response = await axios.post(ML_ENGINE_URL, { edges });
 *        return response.data.predictions;
 *      }
 *
 * The ML engine is expected to return the same schema this mock returns.
 * See api_contract.md in the project root for the full schema definition.
 */

const CONGESTION_LEVELS = ['Uncongested', 'Balanced', 'Moderately Congested', 'Highly Congested'];

/**
 * Derives a semi-realistic congestion status from edge telemetry.
 * Adds slight randomness to simulate dynamic network conditions.
 * @param {number} throughput_mbps
 * @param {number} capacity_mbps
 * @returns {{ status: string, probability: number }}
 */
function classifyEdge(throughput_mbps, capacity_mbps) {
  const ratio = throughput_mbps / capacity_mbps;
  // Add ±8% noise to simulate live sensor readings
  const noise = (Math.random() - 0.5) * 0.16;
  const effective = Math.max(0, Math.min(1, ratio + noise));

  if (effective >= 0.80) {
    return { status: 'Highly Congested',       probability: parseFloat(effective.toFixed(3)) };
  } else if (effective >= 0.55) {
    return { status: 'Moderately Congested',   probability: parseFloat(effective.toFixed(3)) };
  } else if (effective >= 0.25) {
    return { status: 'Balanced',               probability: parseFloat((1 - effective).toFixed(3)) };
  } else {
    return { status: 'Uncongested',            probability: parseFloat((1 - effective).toFixed(3)) };
  }
}

/**
 * Mock implementation of the congestion prediction service.
 * Accepts an array of active edge objects and returns predictions.
 * @param {Array} edges - active (non-dropped) edge objects from the network state
 * @returns {Promise<Array>} predictions in the API contract format
 */
async function predictCongestion(edges) {
  // Simulate a small network/processing delay
  await new Promise(resolve => setTimeout(resolve, 150));

  return edges.map(edge => {
    const { status, probability } = classifyEdge(edge.throughput_mbps, edge.capacity_mbps);
    return {
      edge_id:           edge.id,
      congestion_status: status,
      probability:       probability
    };
  });
}

module.exports = { predictCongestion };
