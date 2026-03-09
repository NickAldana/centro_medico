const express = require('express');
const router = express.Router();
const configController = require('../controllers/configuracionController');

// Configuración
router.get('/sistema', configController.getConfiguracionSistema);
router.put('/sistema', configController.updateConfiguracionSistema);

// Seguridad (Roles y Permisos)
router.get('/roles', configController.getRoles);
router.get('/roles/:id/permisos', configController.getPermisosPorRol); // NUEVA
router.post('/roles/:id/permisos', configController.guardarPermisosRol); // NUEVA

// Auditoría
router.get('/logs', configController.getLogs);

// Backup
router.get('/backup', configController.createBackup);

module.exports = router;