// =====================================================================
// MIDDLEWARE DE AUDITORÍA (BITÁCORA) - VERSIÓN BLINDADA
// =====================================================================

const jwt = require('jsonwebtoken');
const database = require('../utils'); // Conexión directa a Oracle
const JWT_SECRET = process.env.JWT_SECRET || 'secreto_medico_2024';

const auditMiddleware = (req, res, next) => {
    // 1. Excluir rutas que generan mucho ruido o no son relevantes
    const excludedRoutes = [
        '/api/health',
        '/api/auth/login', // El login lo registra auth.js
        '/api/auditoria',  // No auditamos las consultas a la misma auditoría
        '/api/reportes',   // No auditamos lectura de reportes
        '/favicon.ico'
    ];

    // Ignorar archivos estáticos o exclusiones
    if (excludedRoutes.some(route => req.path.startsWith(route)) || req.path.match(/\.(css|js|png|jpg|pdf|ico)$/)) {
        return next();
    }

    // 2. Registrar al finalizar la petición (Evento 'finish')
    res.on('finish', () => {
        // Ejecutamos de forma asíncrona sin bloquear el hilo principal
        setImmediate(async () => {
            // Solo nos interesan las acciones que alteran la base de datos (POST, PUT, DELETE)
            // Si quieres auditar todo (incluso GET), comenta la siguiente línea:
            if (!['POST', 'PUT', 'DELETE'].includes(req.method)) return;

            // Solo registramos si la respuesta del backend fue exitosa (código 200 al 299)
            if (res.statusCode < 200 || res.statusCode >= 300) return;

            let conn;
            try {
                // 3. EXTRAER EL USUARIO (A PRUEBA DE FALLOS)
                let userId = null;
                
                // Intento 1: Si otro middleware ya decodificó el usuario
                if (req.usuario && req.usuario.id_usuario) userId = req.usuario.id_usuario;
                else if (req.user && req.user.id_usuario) userId = req.user.id_usuario;
                
                // Intento 2: Extraer directamente del Token JWT (Infalible)
                if (!userId) {
                    const authHeader = req.headers['authorization'];
                    if (authHeader && authHeader.startsWith('Bearer ')) {
                        try {
                            const token = authHeader.split(' ')[1];
                            const decoded = jwt.verify(token, JWT_SECRET);
                            userId = decoded.id || decoded.id_usuario;
                        } catch (e) {} // Ignorar token inválido
                    }
                }

                // Si definitivamente no hay usuario, no registramos la acción (ej. intentos de hackeo bloqueados)
                if (!userId) return;

                // 4. Preparamos los datos de la acción
                const ipAddress = String(req.ip || req.connection?.remoteAddress || '127.0.0.1').substring(0, 45);
                const userAgent = String(req.get('User-Agent') || 'Unknown').substring(0, 250);
                const modulo = getModuloFromPath(req.path);
                const { accion, descripcion } = getActionFromRequest(req);

                // 5. INSERTAR EN BASE DE DATOS (Usamos SQL puro para evitar fallos del 'utils.js')
                conn = await database.getConnection();
                const sql = `
                    INSERT INTO BITACORA_ACCESOS 
                    (ID_USUARIO, IP_ADDRESS, USER_AGENT, ACCION, MODULO, DESCRIPCION) 
                    VALUES (:1, :2, :3, :4, :5, :6)
                `;
                
                await conn.execute(sql, [
                    userId, 
                    ipAddress, 
                    userAgent, 
                    accion, 
                    modulo, 
                    descripcion
                ], { autoCommit: true });

            } catch (error) {
                // Solo loguear error en consola del servidor
                console.error('🛡️ [Audit Error] No se pudo registrar en bitácora:', error.message);
            } finally {
                if (conn) {
                    try { await conn.close(); } catch(e){}
                }
            }
        });
    });

    next();
};

// --- FUNCIONES AUXILIARES DE INTELIGENCIA DE AUDITORÍA ---

function getModuloFromPath(path) {
    const url = path.toLowerCase();
    if (url.includes('factura') || url.includes('caja') || url.includes('movimiento')) return 'CAJA';
    if (url.includes('paciente')) return 'ADMISION';
    if (url.includes('cita')) return 'AGENDA';
    if (url.includes('inventario') || url.includes('producto')) return 'FARMACIA';
    if (url.includes('usuario') || url.includes('rol')) return 'ADMIN';
    if (url.includes('configuracion')) return 'SISTEMA';
    return 'GENERAL';
}

function getActionFromRequest(req) {
    const method = req.method;
    const path = req.path.toLowerCase();
    
    let accion = 'CONSULTA';
    let descripcion = `${method} en ruta: ${req.path}`;

    // Mapeo genérico por método HTTP
    if (method === 'POST') accion = 'CREAR';
    if (method === 'PUT' || method === 'PATCH') accion = 'EDITAR';
    if (method === 'DELETE') accion = 'ELIMINAR';

    // Mapeo Inteligente (Textos amigables para el Dashboard)
    if (path.includes('/caja/abrir')) {
        accion = 'ABRIR CAJA';
        descripcion = 'Apertura de sesión de caja (Turno)';
    } else if (path.includes('/caja/cerrar')) {
        accion = 'CERRAR CAJA';
        descripcion = 'Cierre de sesión de caja (Corte Z)';
    } else if (path.includes('/caja/movimiento')) {
        accion = 'MOVIMIENTO CAJA';
        descripcion = 'Registro de ingreso o egreso de caja chica';
    } else if (path.includes('/facturas') && method === 'POST') {
        accion = 'FACTURAR';
        descripcion = 'Emisión de nueva factura/recibo';
    } else if (path.includes('/anular')) {
        accion = 'ANULAR';
        descripcion = 'Anulación de documento/factura';
    } else if (path.includes('/pacientes') && method === 'POST') {
        accion = 'NUEVO PACIENTE';
        descripcion = 'Registro de nuevo paciente en el sistema';
    } else if (path.includes('/citas') && method === 'POST') {
        accion = 'AGENDAR CITA';
        descripcion = 'Creación de nueva cita médica';
    } else if (path.includes('/usuarios') && method === 'POST') {
        accion = 'CREAR';
        descripcion = 'Creación de nuevo usuario en el sistema';
    } else if (path.includes('/usuarios') && method === 'PUT') {
        accion = 'EDITAR';
        descripcion = 'Modificación de datos de usuario';
    } else if (path.includes('/usuarios') && method === 'DELETE') {
        accion = 'ELIMINAR';
        descripcion = 'Desactivación (borrado lógico) de usuario';
    } else if (path.includes('/configuracion') && (method === 'PUT' || method === 'PATCH')) {
        accion = 'EDITAR';
        descripcion = 'Cambio en configuración del sistema';
    }

    // Identificar si están operando sobre un ID específico
    const idMatch = req.path.match(/\/(\d+)$/);
    if (idMatch) {
        descripcion += ` (Registro ID: ${idMatch[1]})`;
    }

    return { accion, descripcion };
}

// Limpiador de logs antiguos (opcional, para uso en cron)
function cleanOldAuditLogs() {
    try {
        const { execute } = require('../utils');
        // Borrar logs de más de 6 meses
        execute("DELETE FROM BITACORA_ACCESOS WHERE FECHA_REGISTRO < ADD_MONTHS(SYSDATE, -6)", {}, { autoCommit: true })
            .then(() => console.log('🧹 Limpieza de bitácora completada'))
            .catch(e => console.error('Error limpieza bitácora:', e.message));
    } catch (e) { console.error(e); }
}

module.exports = auditMiddleware;
module.exports.cleanOldAuditLogs = cleanOldAuditLogs;