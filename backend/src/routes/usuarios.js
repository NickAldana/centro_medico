const express = require('express');
const { body, query } = require('express-validator');
const router = express.Router();
const usuarioController = require('../controllers/usuariosController');

// Validaciones (HU001: nombre completo, CI, correo, teléfono y rol obligatorios)
const validateUser = [
    body('nombres').notEmpty().withMessage('Nombre requerido'),
    body('apellido_paterno').notEmpty().withMessage('Apellido paterno requerido'),
    body('ci').notEmpty().withMessage('CI requerido'),
    body('email').notEmpty().withMessage('Correo electrónico requerido').isEmail().withMessage('Correo no válido'),
    body('telefono').notEmpty().withMessage('Teléfono requerido'),
    body('nombre_usuario').notEmpty().withMessage('Usuario requerido'),
    body('id_rol').isInt().withMessage('Rol requerido'),
    body('fecha_nacimiento').optional().isISO8601().withMessage('Fecha inválida')
];

// 1. Listar Usuarios
router.get('/', [
    query('page').optional().isInt(),
    query('limit').optional().isInt(),
    query('search').optional().trim(),
    query('rol').optional().isInt(),
    query('estado').optional().trim()
], usuarioController.getUsuarios);

// 2. Listar Roles (Debe ir ANTES de /:id)
router.get('/roles', usuarioController.getRoles);

// 3. Obtener Uno
router.get('/:id', usuarioController.getUsuarioById);

// 4. Crear
router.post('/', [
    ...validateUser,
    body('password').isLength({ min: 4 }).withMessage('Contraseña mín 4 caracteres')
], usuarioController.createUsuario);

// 5. Actualizar
router.put('/:id', validateUser, usuarioController.updateUsuario);

// 6. Eliminar
router.delete('/:id', usuarioController.deleteUsuario);

module.exports = router;