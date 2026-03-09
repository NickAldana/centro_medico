// backend/src/routes/auth.js
// ESTADO: CORREGIDO - Fix para el error "select is not a function" y registro de bitácora

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); 
const { body, validationResult } = require('express-validator');
const oracledb = require('oracledb'); // Importamos oracledb
const router = express.Router();

// Importamos utils actuales
const { selectOne, update } = require('../utils');
// Importamos la conexión directa a la BD
const database = require('../utils'); 

const JWT_SECRET = process.env.JWT_SECRET || 'secreto_medico_2024';

const validateLogin = [
    body('username').exists().withMessage('Usuario requerido'),
    body('password').exists().withMessage('Contraseña requerida')
];

router.post('/login', validateLogin, async (req, res) => {
    console.log('------------------------------------------------');
    console.log("🔐 INTENTO DE LOGIN RECIBIDO");
    let conn; // Variable para la conexión manual a Oracle
    
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Datos incompletos', details: errors.array() });
        }

        const { username, password } = req.body;
        console.log(`👤 Usuario: "${username}"`);

        // 1. Buscar al Usuario
        const user = await selectOne(`
            SELECT u.*, r.NOMBRE_ROL, r.NIVEL_ACCESO
            FROM USUARIOS u
            JOIN ROLES r ON u.ID_ROL = r.ID_ROL
            WHERE UPPER(u.NOMBRE_USUARIO) = UPPER(:1) 
              AND UPPER(u.ESTADO) != 'ELIMINADO' 
              AND UPPER(u.ESTADO) = 'ACTIVO'
        `, [username]);

        if (!user) {
            console.log('❌ Error: Usuario no encontrado o inactivo');
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        console.log(`✅ Usuario encontrado: ID ${user.id_usuario} (${user.nombres})`);
        
        // 2. Verificar Bloqueo
        if (user.bloqueado_hasta && new Date(user.bloqueado_hasta) > new Date()) {
            console.log('⛔ Usuario bloqueado');
            return res.status(423).json({ error: "Usuario bloqueado temporalmente" });
        }

        // 3. Verificar Contraseña (HÍBRIDO)
        const dbHash = user.password_hash || ''; 
        let match = false;

        try {
            match = await bcrypt.compare(password, dbHash);
            if (match) console.log('🔓 Match Bcrypt OK');
        } catch (e) { }

        if (!match) {
            if (password.trim() === dbHash.trim()) {
                match = true;
                console.log('🔓 Match Texto Plano OK');
            }
        }

        if (!match) {
            console.log(`❌ Contraseña incorrecta`);
            await incrementFailedAttempts(user.id_usuario);
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        // ====================================================================
        // 🔥 FIX: OBTENER PERMISOS USANDO CONEXIÓN MANUAL A ORACLE
        // ====================================================================
        console.log(`🔍 Buscando permisos para el rol ID: ${user.id_rol}`);
        
        conn = await database.getConnection(); // Abrimos conexión directa
        
        const permisosQuery = `
            SELECT p.NOMBRE_PERMISO 
            FROM ROL_PERMISOS rp
            JOIN PERMISOS p ON rp.ID_PERMISO = p.ID_PERMISO
            WHERE rp.ID_ROL = :id_rol
        `;
        
        const resultPermisos = await conn.execute(permisosQuery, [user.id_rol], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        // Convertimos a un array simple: ['ver_dashboard', 'gestion_usuarios']
        const arrayPermisos = resultPermisos.rows.map(row => row.NOMBRE_PERMISO);
        
        console.log(`📋 Permisos cargados: ${arrayPermisos.length}`);
        // ====================================================================

        // LOGIN EXITOSO
        console.log('🚀 Login exitoso. Generando token...');
        await resetFailedAttempts(user.id_usuario);
        await updateLastAccess(user.id_usuario);

        const token = jwt.sign(
            { 
                id: user.id_usuario, 
                username: user.nombre_usuario, 
                rol: user.id_rol, 
                nivel: user.nivel_acceso 
            },
            JWT_SECRET,
            { expiresIn: '12h' }
        );

        await recordSuccessfulLogin(user.id_usuario, user.nombre_usuario, req);

        res.json({
            message: 'Login exitoso',
            success: true,
            token: token,
            usuario: {
                id_usuario: user.id_usuario,
                nombres: user.nombres,
                apellido_paterno: user.apellido_paterno,
                apellido_materno: user.apellido_materno,
                apellidos: user.apellidos || `${user.apellido_paterno || ''} ${user.apellido_materno || ''}`.trim(),
                email: user.email,
                rol: user.nombre_rol,
                nombre_rol: user.nombre_rol,
                nombre_usuario: user.nombre_usuario,
                username: user.nombre_usuario,
                cargo: user.cargo,
                especialidad: user.especialidad,
                permisos: arrayPermisos 
            },
            user: { 
                id_usuario: user.id_usuario,
                nombres: user.nombres,
                apellido_paterno: user.apellido_paterno,
                apellido_materno: user.apellido_materno,
                apellidos: user.apellidos || `${user.apellido_paterno || ''} ${user.apellido_materno || ''}`.trim(),
                email: user.email,
                rol: user.nombre_rol,
                nombre_rol: user.nombre_rol,
                nombre_usuario: user.nombre_usuario,
                username: user.nombre_usuario,
                cargo: user.cargo,
                especialidad: user.especialidad,
                permisos: arrayPermisos 
            }
        });

    } catch (error) {
        console.error('❌ ERROR FATAL:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    } finally {
        // MUY IMPORTANTE: Cerrar la conexión manual
        if (conn) {
            try {
                await conn.close();
            } catch (err) {
                console.error('Error cerrando conexión en login:', err);
            }
        }
    }
});

// 🔥 FIX: Función de auditoría en crudo para asegurar el registro
async function recordSuccessfulLogin(userId, username, req) {
    let conn;
    try {
        conn = await database.getConnection();
        const sql = `INSERT INTO BITACORA_ACCESOS (ID_USUARIO, IP_ADDRESS, USER_AGENT, ACCION, MODULO, DESCRIPCION) 
                     VALUES (:1, :2, :3, :4, :5, :6)`;
        await conn.execute(sql, [
            userId, 
            String(req.ip || '127.0.0.1').substring(0, 45), 
            'Web', 
            'LOGIN', 
            'AUTH', 
            `Ingreso exitoso al sistema: ${username}`
        ], { autoCommit: true });
    } catch (e) {
        console.error('❌ Error registrando bitácora de login:', e.message);
    } finally {
        if(conn) { try { await conn.close(); } catch(err){} }
    }
}

async function incrementFailedAttempts(userId) { try {} catch (e) {} }
async function resetFailedAttempts(userId) { try { await update('USUARIOS', { intentos_fallidos: 0, bloqueado_hasta: null }, { id_usuario: userId }); } catch (e) {} }
async function updateLastAccess(userId) { try { await update('USUARIOS', { ultimo_acceso: new Date() }, { id_usuario: userId }); } catch (e) {} }

module.exports = router;