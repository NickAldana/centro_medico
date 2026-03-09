const { Router } = require('express');
const router = Router();
const { check } = require('express-validator');
const pacienteController = require('../controllers/pacienteController');

// OBTENER TODOS
router.get('/', pacienteController.getPacientes);

// HU002: Exportar debe ir ANTES de /:id para no interpretar "export" como ID
router.get('/export/excel', pacienteController.exportTodosPacientesExcel);

// OBTENER UNO
router.get('/:id', pacienteController.getPacienteById);

// CREAR (AQUÍ ESTÁ EL ERROR QUE TE DETIENE)
router.post('/', [
    check('nombres', 'El nombre es obligatorio').not().isEmpty(),
    
    // --- CAMBIO IMPORTANTE ---
    // Antes decía: check('apellidos', ...). Tienes que cambiarlo a:
    check('apellido_paterno', 'El apellido paterno es obligatorio').not().isEmpty(),
    // -------------------------

    check('ci', 'El CI es obligatorio').not().isEmpty(),
    // Puedes agregar validaciones opcionales para email si quieres
    // check('email', 'Email no válido').optional({ checkFalsy: true }).isEmail()
], pacienteController.createPaciente);

// ACTUALIZAR (TAMBIÉN CORRIGE ESTE)
router.put('/:id', [
    check('nombres', 'El nombre es obligatorio').not().isEmpty(),
    
    // --- CAMBIO IMPORTANTE ---
    check('apellido_paterno', 'El apellido paterno es obligatorio').not().isEmpty(),
    // -------------------------
    
    check('ci', 'El CI es obligatorio').not().isEmpty()
], pacienteController.updatePaciente);

// ELIMINAR
router.delete('/:id', pacienteController.deletePaciente);

// EXPORTAR PDF (por ID)
router.get('/:id/pdf', pacienteController.exportPacientePDF);

module.exports = router;