const jwt = require('jsonwebtoken');
const { selectOne, update } = require('../utils');

// =====================================================================
// MIDDLEWARE PRINCIPAL DE AUTENTICACIÓN
// =====================================================================
const authMiddleware = async (req, res, next) => {
    try {
        // 1. Verificar cabecera
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Token no proporcionado o formato inválido' });
        }

        // 2. Verificar Token JWT
        const token = authHeader.substring(7);
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET || req.app.locals.JWT_SECRET);
        } catch (err) {
            return res.status(401).json({ error: 'Token inválido o expirado' });
        }

        // 3. Consultar Usuario (Optimizado)
        // Usamos UPPER en el estado por seguridad con Oracle
        const query = `
            SELECT u.*, r.NOMBRE_ROL, r.NIVEL_ACCESO
            FROM USUARIOS u
            JOIN ROLES r ON u.ID_ROL = r.ID_ROL
            WHERE u.ID_USUARIO = :id 
            AND UPPER(u.ESTADO) = 'ACTIVO'
        `;

        const user = await selectOne(query, { id: decoded.id });

        // 4. Validaciones de Usuario
        if (!user) {
            return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
        }

        if (user.bloqueado_hasta && new Date(user.bloqueado_hasta) > new Date()) {
            return res.status(423).json({ 
                error: 'Usuario bloqueado temporalmente', 
                bloqueado_hasta: user.bloqueado_hasta 
            });
        }

        // 5. Inyectar usuario en la petición (Todo en minúsculas gracias a utils)
        req.usuario = {
            id_usuario: user.id_usuario,
            nombres: user.nombres,
            apellidos: user.apellidos,
            email: user.email,
            ci: user.ci,
            id_rol: user.id_rol,
            nombre_rol: user.nombre_rol,
            nivel_acceso: user.nivel_acceso,
            especialidad: user.especialidad,
            cargo: user.cargo
        };

        // -------------------------------------------------------------------
        // 🔥 CORRECCIÓN CRÍTICA: "FIRE AND FORGET"
        // -------------------------------------------------------------------
        // NO usamos 'await'. Ejecutamos la actualización en segundo plano.
        // Si la base de datos se demora, el usuario NO lo nota.
        update('USUARIOS', { ULTIMO_ACCESO: { raw: 'CURRENT_TIMESTAMP' } }, { ID_USUARIO: user.id_usuario })
            .catch(err => console.error('[Non-Blocking Log] Error act. fecha acceso:', err.message));
        
        // Continuar inmediatamente
        next();

    } catch (error) {
        console.error('Error crítico en authMiddleware:', error);
        res.status(500).json({ error: 'Error interno de autenticación' });
    }
};

// =====================================================================
// HELPERS DE PERMISOS (Se mantienen igual, lógica correcta)
// =====================================================================

// Verificar Permiso Específico
const checkPermission = (permisoRequerido) => {
    return async (req, res, next) => {
        try {
            if (!req.usuario) return res.status(401).json({ error: 'Usuario no autenticado' });
            
            // Superadmin (Nivel 5) pasa siempre
            if (req.usuario.nivel_acceso >= 5) return next();

            const query = `
                SELECT COUNT(*) AS TIENE_PERMISO
                FROM ROL_PERMISOS RP
                JOIN PERMISOS P ON RP.ID_PERMISO = P.ID_PERMISO
                WHERE RP.ID_ROL = :id_rol AND P.NOMBRE_PERMISO = :perm
            `;

            const result = await selectOne(query, { id_rol: req.usuario.id_rol, perm: permisoRequerido });
            
            // Verificación segura de número
            const count = result ? Object.values(result)[0] : 0; // Maneja si devuelve TIENE_PERMISO o tiene_permiso
            
            if (Number(count) === 0) {
                return res.status(403).json({ error: 'No tienes permiso para realizar esta acción', permiso: permisoRequerido });
            }

            next();
        } catch (err) {
            console.error('Error al verificar permisos:', err.message);
            res.status(500).json({ error: 'Error de verificación de permisos' });
        }
    };
};

// Verificar Rol (Array o String)
const checkRole = (rolesPermitidos) => {
    return (req, res, next) => {
        if (!req.usuario) return res.status(401).json({ error: 'Usuario no autenticado' });

        if (typeof rolesPermitidos === 'string') rolesPermitidos = [rolesPermitidos];

        if (!rolesPermitidos.includes(req.usuario.nombre_rol)) {
            return res.status(403).json({ 
                error: 'Rol no autorizado',
                rol_requerido: rolesPermitidos.join(', ')
            });
        }
        next();
    };
};

// Verificar Nivel Numérico
const checkAccessLevel = (nivelMinimo) => {
    return (req, res, next) => {
        if (!req.usuario) return res.status(401).json({ error: 'Usuario no autenticado' });

        if (req.usuario.nivel_acceso < nivelMinimo) {
            return res.status(403).json({ error: 'Nivel de acceso insuficiente' });
        }
        next();
    };
};

// Verificar Propiedad del Recurso
const checkResourceAccess = (resourceIdParam = 'id_usuario') => {
    return (req, res, next) => {
        const resourceOwnerId = parseInt(req.params[resourceIdParam]);
        const currentUserId = req.usuario.id_usuario;

        // Admin o Dueño del recurso
        if (req.usuario.nivel_acceso >= 4 || resourceOwnerId === currentUserId) {
            return next();
        }

        return res.status(403).json({ error: 'No tienes permiso para acceder a este recurso' });
    };
};

// Verificar Acceso Médico
const checkMedicalAccess = (req, res, next) => {
    const rolesMedicos = ['medico', 'director_medico', 'administrador', 'enfermero'];
    if (!req.usuario || !rolesMedicos.includes(req.usuario.nombre_rol)) {
        return res.status(403).json({ error: 'Se requiere rol médico para esta acción' });
    }
    next();
};

module.exports = {
    authMiddleware,
    checkPermission,
    checkRole,
    checkAccessLevel,
    checkResourceAccess,
    checkMedicalAccess
};