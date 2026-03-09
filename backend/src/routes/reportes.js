const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportesController');

router.get('/dashboard', reportesController.getDashboardKPI);
router.get('/graficos', reportesController.getDatosGraficos);
router.get('/historial-cajas', reportesController.getHistorialCajas);
router.get('/exportar/pdf', reportesController.exportarPDF);
router.get('/exportar/excel', reportesController.exportarExcel);

module.exports = router;