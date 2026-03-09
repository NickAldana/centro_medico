const express = require('express');
const { body } = require('express-validator'); // Solo lo necesario
const router = express.Router();
const citasController = require('../controllers/citasController');
const { authMiddleware } = require('../middleware/auth'); // Si usas auth

// Validaciones básicas para crear/actualizar
const validateCita = [
    body('id_paciente').isInt().withMessage('Paciente requerido'),
    body('id_medico').isInt().withMessage('Médico requerido'),
    body('fecha_cita').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Fecha inválida (YYYY-MM-DD)'),
    body('hora_inicio').matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Hora inicio inválida'),
    body('hora_fin').optional().matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Hora fin inválida')
];

// 1. Obtener datos para los selects (PACIENTES Y MEDICOS)
// IMPORTANTE: Esta ruta debe ir ANTES de /:id para no confundirla con un ID
router.get('/form-data', citasController.getDatosFormulario);

// 2. Obtener disponibilidad
router.get('/disponibilidad', citasController.getDisponibilidad);

// 3. Listar citas
router.get('/', citasController.getCitas);

// 4. Obtener una cita
router.get('/:id', citasController.getCitaById);

// 5. Crear cita
router.post('/', validateCita, citasController.createCita);

// 6. Actualizar cita
router.put('/:id', validateCita, citasController.updateCita);

// 7. Eliminar (Cancelar) cita
router.delete('/:id', citasController.deleteCita);

module.exports = router;