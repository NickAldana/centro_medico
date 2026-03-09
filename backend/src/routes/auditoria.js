const express = require('express');
const router = express.Router();
const auditoriaController = require('../controllers/auditoriaController');

// 1. Listado con filtros y paginación
router.get('/', auditoriaController.getBitacora);

// 2. Resumen Estadístico (Tarjetas)
router.get('/resumen', auditoriaController.getResumenAuditoria);

// 3. Combos para filtros
router.get('/acciones', auditoriaController.getAcciones);
router.get('/modulos', auditoriaController.getModulos);

// 4. Exportar Excel
router.get('/exportar', auditoriaController.exportarBitacora);

module.exports = router;