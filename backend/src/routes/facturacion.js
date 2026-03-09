const express = require('express');
const { body, query } = require('express-validator');
const router = express.Router();
const facturacionController = require('../controllers/facturacionController');

router.get('/facturas', facturacionController.getFacturas);
router.get('/facturas/siguiente-referencia', facturacionController.getSiguienteReferencia);
router.get('/facturas/:id', facturacionController.getFacturaById);
router.post('/facturas', [
    body('id_paciente').isInt().withMessage('Paciente requerido'),
    body('detalles').isArray({min:1}).withMessage('Faltan detalles')
], facturacionController.createFactura);

router.put('/facturas/:id/anular', facturacionController.anularFactura);
router.get('/pacientes/:id_paciente/citas-pendientes', facturacionController.getCitasPendientes);

// Sesiones de Caja
router.get('/caja/sesion-activa', facturacionController.getSesionActiva);
router.post('/caja/abrir', facturacionController.abrirSesionCaja);
router.post('/caja/cerrar/:id', facturacionController.cerrarSesionCaja);

// Movimientos de Caja Chica
router.post('/caja/movimiento', facturacionController.registrarMovimientoCaja);

// Reportes
router.get('/reportes/ingresos', facturacionController.getReporteIngresos);

module.exports = router;