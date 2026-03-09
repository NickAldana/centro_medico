/**
 * CONTROLADOR DE USUARIOS - CORREGIDO
 * Compatible con APELLIDO_PATERNO / MATERNO
 * INCLUYE FUNCIÓN DE LOGIN CON EXTRACCIÓN DE PERMISOS
 */

const oracledb = require('oracledb');
const bcrypt = require('bcryptjs'); 
const { validationResult } = require('express-validator');
const database = require('../utils'); 
const jwt = require('jsonwebtoken'); // ¡Añadido para el Login!

const controller = {};
const safeStr = (v) => v ? String(v) : '';

// 1. LISTAR USUARIOS
controller.getUsuarios = async (req, res) => {
    let conn;
    try {
        conn = await database.getConnection();

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search ? req.query.search.trim() : '';
        const rol = req.query.rol;
        const estado = req.query.estado;

        const offset = (page - 1) * limit;
        const maxRow = offset + limit;

        const whereParts = ["u.ESTADO != 'ELIMINADO'"];
        const binds = {};

        if (estado && estado !== 'TODOS') {
            whereParts.push("UPPER(u.ESTADO) = :estado");
            binds.estado = estado.toUpperCase();
        }

        if (rol) {
            whereParts.push("u.ID_ROL = :rol");
            binds.rol = parseInt(rol);
        }

        if (search) {
            binds.searchRaw = `%${search.toUpperCase()}%`;
            whereParts.push(`(
                UPPER(u.NOMBRES) LIKE :searchRaw OR 
                UPPER(u.APELLIDO_PATERNO) LIKE :searchRaw OR 
                UPPER(u.APELLIDO_MATERNO) LIKE :searchRaw OR
                u.CI LIKE :searchRaw OR
                UPPER(u.NOMBRE_USUARIO) LIKE :searchRaw
            )`);
        }

        const whereClause = `WHERE ${whereParts.join(' AND ')}`;

        const countRes = await conn.execute(`SELECT COUNT(*) AS TOTAL FROM USUARIOS u ${whereClause}`, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const total = countRes.rows[0].TOTAL;

        const dataBinds = { ...binds, maxRow, offset };
        const dataQuery = `
            SELECT * FROM (
                SELECT a.*, ROWNUM rnum FROM (
                    SELECT u.ID_USUARIO, u.NOMBRES, u.APELLIDO_PATERNO, u.APELLIDO_MATERNO, u.CI, u.EMAIL, 
                           u.TELEFONO, u.CARGO, u.ESPECIALIDAD, u.ESTADO, u.NOMBRE_USUARIO,
                           u.FECHA_NACIMIENTO, u.GENERO,
                           r.NOMBRE_ROL, u.ID_ROL, u.ULTIMO_ACCESO
                    FROM USUARIOS u
                    JOIN ROLES r ON u.ID_ROL = r.ID_ROL
                    ${whereClause}
                    ORDER BY u.ID_USUARIO DESC
                ) a WHERE ROWNUM <= :maxRow
            ) WHERE rnum > :offset
        `;

        const result = await conn.execute(dataQuery, dataBinds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const usuarios = result.rows.map(u => ({
            id_usuario: u.ID_USUARIO,
            nombres: safeStr(u.NOMBRES),
            apellido_paterno: safeStr(u.APELLIDO_PATERNO),
            apellido_materno: safeStr(u.APELLIDO_MATERNO),
            apellidos: `${safeStr(u.APELLIDO_PATERNO)} ${safeStr(u.APELLIDO_MATERNO)}`.trim(), 
            nombre_completo: `${safeStr(u.NOMBRES)} ${safeStr(u.APELLIDO_PATERNO)} ${safeStr(u.APELLIDO_MATERNO)}`.trim(),
            ci: safeStr(u.CI),
            email: safeStr(u.EMAIL),
            telefono: safeStr(u.TELEFONO),
            cargo: safeStr(u.CARGO),
            especialidad: safeStr(u.ESPECIALIDAD),
            nombre_usuario: safeStr(u.NOMBRE_USUARIO),
            rol: safeStr(u.NOMBRE_ROL),
            id_rol: u.ID_ROL,
            estado: safeStr(u.ESTADO),
            fecha_nacimiento: u.FECHA_NACIMIENTO,
            genero: safeStr(u.GENERO)
        }));

        const totalPages = Math.ceil(total / limit);

        res.json({
            usuarios,
            rows: usuarios,
            pagination: { page, limit, total, totalPages }
        });

    } catch (error) {
        console.error('❌ Error GET /usuarios:', error);
        res.status(500).json({ error: 'Error al listar usuarios', detail: error.message });
    } finally {
        if (conn) await conn.close();
    }
};

// 2. GET ONE
controller.getUsuarioById = async (req, res) => {
    let conn;
    try {
        conn = await database.getConnection();
        const id = parseInt(req.params.id);
        const result = await conn.execute(
            `SELECT u.*, r.NOMBRE_ROL FROM USUARIOS u JOIN ROLES r ON u.ID_ROL = r.ID_ROL WHERE u.ID_USUARIO = :id`, 
            [id], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

        const u = result.rows[0];
        let fechaNacISO = u.FECHA_NACIMIENTO ? u.FECHA_NACIMIENTO.toISOString().split('T')[0] : '';

        res.json({
            id_usuario: u.ID_USUARIO,
            nombres: safeStr(u.NOMBRES),
            apellido_paterno: safeStr(u.APELLIDO_PATERNO),
            apellido_materno: safeStr(u.APELLIDO_MATERNO),
            apellidos: `${safeStr(u.APELLIDO_PATERNO)} ${safeStr(u.APELLIDO_MATERNO)}`.trim(),
            ci: safeStr(u.CI),
            email: safeStr(u.EMAIL),
            telefono: safeStr(u.TELEFONO),
            direccion: safeStr(u.DIRECCION),
            cargo: safeStr(u.CARGO),
            especialidad: safeStr(u.ESPECIALIDAD),
            nombre_usuario: safeStr(u.NOMBRE_USUARIO),
            id_rol: u.ID_ROL,
            estado: safeStr(u.ESTADO).toLowerCase(),
            genero: safeStr(u.GENERO),
            fecha_nacimiento: fechaNacISO
        });

    } catch (error) {
        res.status(500).json({ error: 'Error interno' });
    } finally {
        if (conn) await conn.close();
    }
};

// 3. CREATE
controller.createUsuario = async (req, res) => {
    let conn;
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

        conn = await database.getConnection();
        const { nombres, apellido_paterno, apellido_materno, ci, email, telefono, direccion, cargo, especialidad, id_rol, nombre_usuario, password, estado, fecha_nacimiento, genero } = req.body;

        if (!apellido_paterno) return res.status(400).json({ error: 'Apellido Paterno obligatorio' });
        if (!email || !email.trim()) return res.status(400).json({ error: 'Correo electrónico obligatorio' });

        // HU001 Criterio 3: Validar que no existan correos ni CI duplicados
        const check = await conn.execute(
            `SELECT 1 FROM USUARIOS WHERE (NOMBRE_USUARIO = :u OR CI = :c OR UPPER(TRIM(EMAIL)) = UPPER(TRIM(:email))) AND UPPER(ESTADO) != 'ELIMINADO'`,
            { u: nombre_usuario, c: ci, email: email.trim() }
        );
        if (check.rows.length > 0) return res.status(400).json({ error: 'Usuario, CI o correo electrónico ya existen' });

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);

        const sql = `
            INSERT INTO USUARIOS (
                NOMBRES, APELLIDO_PATERNO, APELLIDO_MATERNO, CI, EMAIL, TELEFONO, DIRECCION, 
                CARGO, ESPECIALIDAD, ID_ROL, NOMBRE_USUARIO, PASSWORD_HASH, 
                ESTADO, FECHA_NACIMIENTO, GENERO, CREADO_EN
            ) VALUES (
                :nombres, :paterno, :materno, :ci, :email, :telefono, :direccion, 
                :cargo, :especialidad, :id_rol, :nombre_usuario, :hash, 
                :estado, TO_DATE(:fecha_nacimiento, 'YYYY-MM-DD'), :genero, CURRENT_TIMESTAMP
            ) RETURNING ID_USUARIO INTO :id_out
        `;

        const result = await conn.execute(sql, {
            nombres, paterno: apellido_paterno, materno: apellido_materno || '',
            ci, email: email || '', telefono: telefono || '', direccion: direccion || '',
            cargo: cargo || '', especialidad: especialidad || '', id_rol: parseInt(id_rol),
            nombre_usuario, hash, estado: (estado || 'ACTIVO').toUpperCase(),
            fecha_nacimiento: fecha_nacimiento || null, genero: genero || null,
            id_out: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT }
        }, { autoCommit: true });

        res.status(201).json({ message: 'Usuario creado', id_usuario: result.outBinds.id_out[0] });

    } catch (error) {
        res.status(500).json({ error: 'Error al crear usuario', detail: error.message });
    } finally {
        if (conn) await conn.close();
    }
};

// 4. UPDATE
controller.updateUsuario = async (req, res) => {
    let conn;
    try {
        const id = parseInt(req.params.id);
        const { nombres, apellido_paterno, apellido_materno, ci, email, telefono, direccion, cargo, especialidad, id_rol, password, estado, fecha_nacimiento, genero } = req.body;

        conn = await database.getConnection();
        const check = await conn.execute('SELECT 1 FROM USUARIOS WHERE ID_USUARIO = :id', [id]);
        if (check.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

        // HU001 Criterio 3: En edición, validar CI y email no duplicados por otro usuario
        if (ci && ci.trim()) {
            const dupCi = await conn.execute(
                'SELECT 1 FROM USUARIOS WHERE CI = :c AND ID_USUARIO != :id AND UPPER(ESTADO) != \'ELIMINADO\'',
                { c: ci.trim(), id }
            );
            if (dupCi.rows.length > 0) return res.status(400).json({ error: 'El CI ya está registrado por otro usuario' });
        }
        if (email && email.trim()) {
            const dupEmail = await conn.execute(
                'SELECT 1 FROM USUARIOS WHERE UPPER(TRIM(EMAIL)) = UPPER(TRIM(:email)) AND ID_USUARIO != :id AND UPPER(ESTADO) != \'ELIMINADO\'',
                { email: email.trim(), id }
            );
            if (dupEmail.rows.length > 0) return res.status(400).json({ error: 'El correo electrónico ya está registrado por otro usuario' });
        }

        let passwordSql = '';
        let binds = {
            id, nombres, paterno: apellido_paterno, materno: apellido_materno || '',
            ci, email: email || '', telefono: telefono || '', direccion: direccion || '',
            cargo: cargo || '', especialidad: especialidad || '', id_rol: parseInt(id_rol),
            estado: (estado || 'ACTIVO').toUpperCase(),
            fecha_nacimiento: fecha_nacimiento || null, genero: genero || null
        };

        if (password && password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            binds.hash = await bcrypt.hash(password, salt);
            passwordSql = `, PASSWORD_HASH = :hash`;
        }

        const sql = `
            UPDATE USUARIOS SET
                NOMBRES = :nombres, APELLIDO_PATERNO = :paterno, APELLIDO_MATERNO = :materno,
                CI = :ci, EMAIL = :email, TELEFONO = :telefono, DIRECCION = :direccion,
                CARGO = :cargo, ESPECIALIDAD = :especialidad, ID_ROL = :id_rol,
                ESTADO = :estado, FECHA_NACIMIENTO = TO_DATE(:fecha_nacimiento, 'YYYY-MM-DD'),
                GENERO = :genero, ACTUALIZADO_EN = CURRENT_TIMESTAMP
                ${passwordSql}
            WHERE ID_USUARIO = :id
        `;

        await conn.execute(sql, binds, { autoCommit: true });
        res.json({ message: 'Usuario actualizado' });

    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar', detail: error.message });
    } finally {
        if (conn) await conn.close();
    }
};

// 5. DELETE
controller.deleteUsuario = async (req, res) => {
    let conn;
    try {
        conn = await database.getConnection();
        const id = parseInt(req.params.id);
        await conn.execute("UPDATE USUARIOS SET ESTADO = 'ELIMINADO' WHERE ID_USUARIO = :id", [id], { autoCommit: true });
        res.json({ message: 'Usuario eliminado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (conn) await conn.close();
    }
};

// 6. ROLES
controller.getRoles = async (req, res) => {
    let conn;
    try {
        conn = await database.getConnection();
        const result = await conn.execute("SELECT ID_ROL, NOMBRE_ROL FROM ROLES WHERE ESTADO = 'activo' ORDER BY NOMBRE_ROL", [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        res.json({ roles: result.rows.map(r => ({ id_rol: r.ID_ROL, nombre_rol: r.NOMBRE_ROL })) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if (conn) await conn.close();
    }
};

// =====================================================================
// 7. LOGIN (NUEVO - EXTRAE PERMISOS PARA EL FRONTEND)
// =====================================================================
/*
controller.login = async (req, res) => {
    let conn;
    try {
        const { nombre_usuario, password } = req.body;
        
        if (!nombre_usuario || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
        }

        conn = await database.getConnection();

        // 1. Buscar al usuario
        const result = await conn.execute(
            `SELECT ID_USUARIO, NOMBRES, ID_ROL, PASSWORD_HASH, ESTADO 
             FROM USUARIOS 
             WHERE NOMBRE_USUARIO = :usr`,
            [nombre_usuario],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const user = result.rows[0];

        if (user.ESTADO !== 'ACTIVO') {
            return res.status(403).json({ error: 'Usuario inactivo' });
        }

        // 2. Validar contraseña
        const validPassword = await bcrypt.compare(password, user.PASSWORD_HASH);
        if (!validPassword) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        // 3. Obtener permisos del usuario desde la base de datos
        const permisosQuery = `
            SELECT p.NOMBRE_PERMISO 
            FROM ROL_PERMISOS rp
            JOIN PERMISOS p ON rp.ID_PERMISO = p.ID_PERMISO
            WHERE rp.ID_ROL = :id_rol
        `;
        const permisosRes = await conn.execute(permisosQuery, [user.ID_ROL], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        // Convertir el resultado a un array simple: ['ver_dashboard', 'gestion_usuarios']
        const arrayPermisos = permisosRes.rows.map(row => row.NOMBRE_PERMISO);

        // 4. Generar Token
        const token = jwt.sign(
            { id: user.ID_USUARIO, rol: user.ID_ROL }, 
            process.env.JWT_SECRET || 'mi_clave_secreta_desarrollo', 
            { expiresIn: '8h' }
        );

        // 5. Enviar respuesta al Frontend
        res.json({
            token,
            usuario: {
                id: user.ID_USUARIO,
                nombres: user.NOMBRES,
                id_rol: user.ID_ROL,
                permisos: arrayPermisos // <-- El frontend usará esto
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno en el servidor' });
    } finally {
        if (conn) await conn.close();
    }
};*/

module.exports = controller;