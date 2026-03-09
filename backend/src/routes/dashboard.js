// backend/src/routes/dashboard.js
const express = require('express');
const router = express.Router();
const { getStats } = require('../controllers/dashboardController');

// TU FRONTEND LLAMA A ESTAS RUTAS
router.get('/resumen', getStats);
router.get('/stats', getStats); // Redundante pero no daña

module.exports = router;