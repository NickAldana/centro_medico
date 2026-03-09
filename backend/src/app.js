// backend/src/app.js
// ESTADO: MODO DESARROLLO (Seguridad deshabilitada temporalmente para pruebas)

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

// --- Importación de Rutas ---
const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const pacientesRoutes = require('./routes/pacientes');
const citasRoutes = require('./routes/citas');
const inventarioRoutes = require('./routes/inventario');
const facturacionRoutes = require('./routes/facturacion');
const reportesRoutes = require('./routes/reportes');
const configuracionRoutes = require('./routes/configuracion');
const dashboardRoutes = require('./routes/dashboard');
const diagnosticRoutes = require('./routes/diagnostic');
const auditoriaRoutes = require('./routes/auditoria');
const notificacionesRoutes = require('./routes/notificaciones');

// --- Middlewares ---
// NOTA: authMiddleware comentado temporalmente para permitir el flujo de datos sin login
const { authMiddleware } = require('./middleware/auth');
const auditMiddleware = require('./middleware/audit');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'secreto_medico_2024';
app.locals.JWT_SECRET = JWT_SECRET;

// --- Seguridad y Configuración Básica ---
app.use(helmet({
    contentSecurityPolicy: false, // Desactivado para evitar bloqueos en scripts locales
}));

// Límite de peticiones aumentado para desarrollo
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 1000, message: { error: 'Límite de peticiones excedido' } }));

app.use(cors()); // Permitir todas las conexiones cruzadas
app.use(morgan('dev')); // Logs en consola más limpios
app.use(express.json({ limit: '50mb' })); // Aumentado límite para subida de archivos/imágenes
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../../frontend')));

// HU001/HU008: Registrar en bitácora creación, edición y eliminación en todos los módulos
app.use(auditMiddleware);

// =========================================================================
// 🚦 GESTIÓN DE RUTAS (LIBERADAS / OPEN DOORS)
// =========================================================================

// Rutas Públicas Base
app.use('/api/auth', authRoutes);
app.use('/api/diagnostic', diagnosticRoutes);

// --- Módulos del Sistema (SIN authMiddleware) ---
// Al quitar el middleware, el frontend puede pedir datos sin enviar token.

// 1. Dashboard
app.use('/api/dashboard', dashboardRoutes);

// 2. Usuarios y Roles (Aquí fallaba porque estaba bloqueado)
app.use('/api/usuarios', usuariosRoutes); 

// 3. Pacientes
app.use('/api/pacientes', pacientesRoutes); 

// 4. Citas Médicas
app.use('/api/citas', citasRoutes);

// 5. Inventario
app.use('/api/inventario', inventarioRoutes);

// 6. Facturación
app.use('/api/facturacion', facturacionRoutes);

// 7. Reportes
app.use('/api/reportes', reportesRoutes);

// 8. Configuración
app.use('/api/configuracion', configuracionRoutes);

// 9. Auditoría
app.use('/api/auditoria', auditoriaRoutes);

// 10. Notificaciones (Médicos / Recepcionistas)
app.use('/api/notificaciones', notificacionesRoutes);

// =========================================================================

// Health Check (Para verificar que el servidor vive)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        mode: 'DEVELOPMENT (AUTH DISABLED)',
        timestamp: new Date().toISOString(),
        system: 'Sistema Médico Web'
    });
});

// Fallback SPA (Cualquier ruta no encontrada devuelve el login o index)
app.get('*', (req, res) => {
    // Intenta servir el dashboard si ya están "logueados" conceptualmente, o login
    res.sendFile(path.join(__dirname, '../../frontend/login.html'));
});

// Manejo Global de Errores
app.use((req, res) => res.status(404).json({ error: 'Ruta de API no encontrada' }));

app.use((err, req, res, next) => {
    console.error('❌ Error Global Servidor:', err.stack);
    
    if (err.name === 'ValidationError') {
        return res.status(400).json({ error: 'Datos inválidos', details: err.message });
    }
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Token inválido' });
    }
    
    res.status(500).json({ 
        error: 'Error interno del servidor', 
        detail: err.message 
    });
});

module.exports = app;