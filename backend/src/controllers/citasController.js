/**
 * CONTROLADOR DE CITAS - VERSIÓN FINAL CORREGIDA Y SEGURIZADA
 * Backend: backend/src/controllers/citasController.js
 */

const oracledb = require('oracledb');
const database = require('../config/database'); // Asegurando ruta correcta a la config DB

const controller = {};

// ==================================================================
// 1. OBTENER DATOS FORMULARIO (PACIENTES Y TODO EL PERSONAL)
// ==================================================================
controller.getDatosFormulario = async (req, res) => {
    let conn;
    try {
        conn = await database.getConnection();
        
        // Sin caché para asegurar datos frescos
        res.setHeader('Cache-Control', 'no-store');

        // 1. PACIENTES (Activos)
        const sqlPacientes = `
            SELECT ID_PACIENTE, 
                   (NOMBRES || ' ' || APELLIDO_PATERNO || ' ' || NVL(APELLIDO_MATERNO, '')) AS NOMBRE_COMPLETO
            FROM PACIENTES 
            WHERE ESTADO != 'ELIMINADO'
            ORDER BY APELLIDO_PATERNO ASC
        `;

        // 2. MÉDICOS / PERSONAL (Solo activos)
        const sqlMedicos = `
            SELECT u.ID_USUARIO, 
                   (u.NOMBRES || ' ' || u.APELLIDO_PATERNO || ' ' || NVL(u.APELLIDO_MATERNO, '')) AS NOMBRE_COMPLETO, 
                   u.ESPECIALIDAD,
                   r.NOMBRE_ROL,
                   u.CARGO
            FROM USUARIOS u
            JOIN ROLES r ON u.ID_ROL = r.ID_ROL
            WHERE UPPER(TRIM(u.ESTADO)) = 'ACTIVO'
            ORDER BY u.APELLIDO_PATERNO ASC, u.NOMBRES ASC
        `;

        const [resP, resM] = await Promise.all([
            conn.execute(sqlPacientes, [], { outFormat: oracledb.OUT_FORMAT_OBJECT }),
            conn.execute(sqlMedicos, [], { outFormat: oracledb.OUT_FORMAT_OBJECT })
        ]);

        res.json({
            pacientes: resP.rows, 
            medicos: resM.rows
        });

    } catch (e) {
        console.error("Error getDatosFormulario:", e);
        res.status(500).json({ error: e.message });
    } finally {
        if(conn) { try { await conn.close(); } catch(e){} }
    }
};

// ==================================================================
// 2. LISTAR CITAS (LÓGICA DE ROLES APLICADA)
// ==================================================================
controller.getCitas = async (req, res) => {
    let conn;
    try {
        conn = await database.getConnection();
        
        // Paginación
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        // Filtros del Frontend
        const { fecha, estado, search } = req.query;
        
        // Datos del Usuario Logueado (Inyectados por Auth Middleware)
        const userRol = req.usuario ? req.usuario.nombre_rol : 'Administrador Sistema'; 
        const userId = req.usuario ? req.usuario.id_usuario : 1; // Default admin

        console.log(`[DEBUG] getCitas -> Usuario: ${userId}, Rol: ${userRol}`);

        // Construcción de Query Dinámica
        let whereParts = ["1=1"];
        const binds = {};

        // --- LÓGICA DE SEGURIDAD POR ROL ---
        // Roles que pueden ver TODO (Admin, Recepción, Director)
        // Asegúrate de que los nombres coincidan con tu tabla ROLES
        const rolesVip = [
            'Administrador Sistema', 'ADMIN', 'ADMINISTRADOR', 
            'Recepcionista Mañana', 'Recepcionista Tarde', 'Director Médico'
        ];

        if (rolesVip.includes(userRol)) {
            // ES ADMIN/RECEP: Puede filtrar por médico si el frontend lo pide
            if (req.query.id_medico && req.query.id_medico !== 'TODOS') {
                whereParts.push("c.ID_MEDICO = :medicoFilter");
                binds.medicoFilter = parseInt(req.query.id_medico);
            }
        } else {
            // ES MÉDICO O PERSONAL DE SALUD: Solo ve SU agenda
            // Forzamos el ID del médico al ID del usuario logueado
            whereParts.push("c.ID_MEDICO = :medicoForzado");
            binds.medicoForzado = userId;
        }

        // --- FILTROS COMUNES ---
        if (estado && estado !== 'TODOS' && estado !== '') {
            whereParts.push("UPPER(c.ESTADO) = :estado");
            binds.estado = estado.toUpperCase();
        }

        if (fecha) {
            whereParts.push("TRUNC(c.FECHA_CITA) = TO_DATE(:fecha, 'YYYY-MM-DD')");
            binds.fecha = fecha;
        }

        if (search) {
            binds.search = `%${search.toUpperCase()}%`;
            whereParts.push(`(UPPER(p.NOMBRES) LIKE :search OR UPPER(p.APELLIDO_PATERNO) LIKE :search)`);
        }

        const whereClause = `WHERE ${whereParts.join(' AND ')}`;

        // Query Total (para paginación)
        const sqlCount = `SELECT COUNT(*) AS TOTAL FROM CITAS c JOIN PACIENTES p ON c.ID_PACIENTE = p.ID_PACIENTE ${whereClause}`;
        const countRes = await conn.execute(sqlCount, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const total = countRes.rows[0].TOTAL;

        // Query Principal
        // Nota: Agregamos c.ID_MEDICO a la selección para validar
        const sql = `
            SELECT c.ID_CITA, 
                   c.FECHA_CITA, 
                   c.HORA_INICIO, 
                   c.ESTADO, 
                   c.ESPECIALIDAD,
                   c.ID_MEDICO,
                   (p.NOMBRES || ' ' || p.APELLIDO_PATERNO) AS PACIENTE,
                   (u.NOMBRES || ' ' || u.APELLIDO_PATERNO) AS MEDICO
            FROM CITAS c
            JOIN PACIENTES p ON c.ID_PACIENTE = p.ID_PACIENTE
            LEFT JOIN USUARIOS u ON c.ID_MEDICO = u.ID_USUARIO
            ${whereClause}
            ORDER BY c.FECHA_CITA DESC, c.HORA_INICIO DESC
            OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
        `;

        binds.offset = offset;
        binds.limit = limit;

        const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        // Formatear fechas para el frontend
        const citas = result.rows.map(c => ({
            ...c,
            FECHA_CITA: c.FECHA_CITA ? new Date(c.FECHA_CITA).toISOString().split('T')[0] : null
        }));

        res.json({ 
            citas, 
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            userRole: userRol // Útil para depurar en frontend
        });

    } catch (e) {
        console.error("Error getCitas:", e);
        res.status(500).json({ error: e.message });
    } finally {
        if(conn) { try { await conn.close(); } catch(e){} }
    }
};

// ==================================================================
// 3. OBTENER CITA POR ID
// ==================================================================
controller.getCitaById = async (req, res) => {
    let conn;
    try {
        conn = await database.getConnection();
        const id = parseInt(req.params.id);

        const sql = `
            SELECT c.ID_CITA, c.ID_PACIENTE, c.ID_MEDICO, 
                   TO_CHAR(c.FECHA_CITA, 'YYYY-MM-DD') as FECHA_FORMATO,
                   c.HORA_INICIO, c.HORA_FIN, c.ESPECIALIDAD, c.MOTIVO_CONSULTA,
                   c.COSTO_CONSULTA, c.NOTAS, c.ESTADO
            FROM CITAS c
            WHERE c.ID_CITA = :id
        `;
        
        const result = await conn.execute(sql, [id], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        if (result.rows.length === 0) return res.status(404).json({ error: "Cita no encontrada" });

        const cita = result.rows[0];
        res.json({
            id_cita: cita.ID_CITA,
            id_paciente: cita.ID_PACIENTE,
            id_medico: cita.ID_MEDICO,
            fecha_cita: cita.FECHA_FORMATO,
            hora_inicio: cita.HORA_INICIO,
            hora_fin: cita.HORA_FIN,
            especialidad: cita.ESPECIALIDAD,
            motivo_consulta: cita.MOTIVO_CONSULTA,
            costo_consulta: cita.COSTO_CONSULTA,
            notas: cita.NOTAS,
            estado: cita.ESTADO
        });

    } catch (e) {
        console.error("Error getCitaById:", e);
        res.status(500).json({ error: e.message });
    } finally {
        if(conn) { try { await conn.close(); } catch(e){} }
    }
};

// ==================================================================
// 4. CREAR CITA (CON AUDITORÍA DE USUARIO REAL)
// ==================================================================
controller.createCita = async (req, res) => {
    let conn;
    try {
        const { id_paciente, id_medico, fecha_cita, hora_inicio, hora_fin, especialidad, motivo, costo, notas } = req.body;
        const creadorId = req.usuario ? req.usuario.id_usuario : 1; // Usar ID real del token o default admin

        if(!id_paciente || !id_medico || !fecha_cita || !hora_inicio) {
            return res.status(400).json({ error: "Faltan datos obligatorios: paciente, médico, fecha y hora de inicio" });
        }

        // Validar y calcular hora_fin si no se proporciona
        let horaFinCalculada = hora_fin;
        if (!horaFinCalculada) {
            // Calcular hora_fin como hora_inicio + 30 minutos
            const [h, m] = hora_inicio.split(':').map(Number);
            let horas = h;
            let minutos = m + 30;
            if (minutos >= 60) {
                horas = (horas + 1) % 24;
                minutos -= 60;
            }
            horaFinCalculada = `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
        }

        // Validar que hora_fin > hora_inicio
        if (horaFinCalculada <= hora_inicio) {
            return res.status(400).json({ error: "La hora de fin debe ser posterior a la hora de inicio" });
        }

        conn = await database.getConnection();

        // Validar solapamiento con mejor lógica
        const checkSql = `
            SELECT c.ID_CITA, c.HORA_INICIO, c.HORA_FIN, p.NOMBRES || ' ' || p.APELLIDO_PATERNO AS PACIENTE
            FROM CITAS c
            JOIN PACIENTES p ON c.ID_PACIENTE = p.ID_PACIENTE
            WHERE c.ID_MEDICO = :med 
              AND TRUNC(c.FECHA_CITA) = TO_DATE(:fecha, 'YYYY-MM-DD')
              AND UPPER(c.ESTADO) NOT IN ('CANCELADA', 'ELIMINADA')
              AND (
                  (:hora_ini < c.HORA_FIN AND :hora_fin > c.HORA_INICIO)
              )
        `;
        const ocupado = await conn.execute(checkSql, { 
            med: id_medico, 
            fecha: fecha_cita, 
            hora_ini: hora_inicio,
            hora_fin: horaFinCalculada
        }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        if(ocupado.rows.length > 0) {
            const c = ocupado.rows[0];
            return res.status(409).json({ 
                error: `Horario ocupado con ${c.PACIENTE} de ${c.HORA_INICIO} a ${c.HORA_FIN}`
            });
        }

        const sql = `
            INSERT INTO CITAS (
                ID_PACIENTE, ID_MEDICO, FECHA_CITA, HORA_INICIO, HORA_FIN, 
                ESPECIALIDAD, MOTIVO_CONSULTA, COSTO_CONSULTA, NOTAS, ESTADO, 
                FECHA_CREACION, CREADA_POR
            ) VALUES (
                :id_paciente, :id_medico, TO_DATE(:fecha, 'YYYY-MM-DD'), :hora_ini, :hora_fin,
                :esp, :motivo, :costo, :notas, 'PROGRAMADA', SYSDATE, :creador
            ) RETURNING ID_CITA INTO :id_out
        `;

        const result = await conn.execute(sql, {
            id_paciente, id_medico, fecha: fecha_cita, hora_ini: hora_inicio, hora_fin: horaFinCalculada,
            esp: especialidad || '', motivo: motivo || '', costo: costo || 0, notas: notas || '',
            creador: creadorId,
            id_out: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }, { autoCommit: true });

        res.json({ message: "Cita creada", id_cita: result.outBinds.id_out[0] });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    } finally {
        if(conn) { try { await conn.close(); } catch(e){} }
    }
};

// ==================================================================
// 5. ACTUALIZAR CITA
// ==================================================================
controller.updateCita = async (req, res) => {
    let conn;
    try {
        const id = parseInt(req.params.id);
        const { id_paciente, id_medico, fecha_cita, hora_inicio, hora_fin, especialidad, motivo, costo, notas, estado } = req.body;

        if(!id_paciente || !id_medico || !fecha_cita || !hora_inicio) {
            return res.status(400).json({ error: "Faltan datos obligatorios: paciente, médico, fecha y hora de inicio" });
        }

        // Validar y calcular hora_fin si no se proporciona
        let horaFinCalculada = hora_fin;
        if (!horaFinCalculada) {
            // Calcular hora_fin como hora_inicio + 30 minutos
            const [h, m] = hora_inicio.split(':').map(Number);
            let horas = h;
            let minutos = m + 30;
            if (minutos >= 60) {
                horas = (horas + 1) % 24;
                minutos -= 60;
            }
            horaFinCalculada = `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
        }

        // Validar que hora_fin > hora_inicio
        if (horaFinCalculada <= hora_inicio) {
            return res.status(400).json({ error: "La hora de fin debe ser posterior a la hora de inicio" });
        }

        conn = await database.getConnection();

        // Verificar disponibilidad (excluyendo la cita actual)
        const checkSql = `
            SELECT ID_CITA FROM CITAS 
            WHERE ID_MEDICO = :med
              AND TRUNC(FECHA_CITA) = TO_DATE(:fecha, 'YYYY-MM-DD')
              AND ID_CITA != :id_actual
              AND UPPER(ESTADO) NOT IN ('CANCELADA', 'ELIMINADA')
              AND (
                  (:hora_ini < HORA_FIN AND :hora_fin > HORA_INICIO)
              )
        `;
        const ocupado = await conn.execute(checkSql, { 
            med: id_medico,
            id_actual: id,
            fecha: fecha_cita, 
            hora_ini: hora_inicio, 
            hora_fin: horaFinCalculada
        });
        
        if(ocupado.rows.length > 0) {
            return res.status(409).json({ error: `El médico ya tiene una cita en ese horario.` });
        }

        const sql = `
            UPDATE CITAS SET
                ID_PACIENTE = :id_paciente,
                ID_MEDICO = :id_medico,
                FECHA_CITA = TO_DATE(:fecha, 'YYYY-MM-DD'),
                HORA_INICIO = :hora_ini,
                HORA_FIN = :hora_fin,
                ESPECIALIDAD = :esp,
                MOTIVO_CONSULTA = :motivo,
                COSTO_CONSULTA = :costo,
                NOTAS = :notas,
                ESTADO = :estado,
                ACTUALIZADO_EN = SYSDATE
            WHERE ID_CITA = :id
        `;

        await conn.execute(sql, {
            id_paciente: parseInt(id_paciente),
            id_medico: parseInt(id_medico),
            fecha: fecha_cita, 
            hora_ini: hora_inicio, 
            hora_fin: horaFinCalculada,
            esp: especialidad || '', 
            motivo: motivo || '', 
            costo: costo || 0, 
            notas: notas || '', 
            estado: (estado || 'PROGRAMADA').toUpperCase(),
            id
        }, { autoCommit: true });

        res.json({ message: "Cita actualizada" });

    } catch (e) {
        console.error("Error updateCita:", e);
        res.status(500).json({ error: e.message });
    } finally {
        if(conn) { try { await conn.close(); } catch(e){} }
    }
};

// ==================================================================
// 6. ELIMINAR / CANCELAR CITA
// ==================================================================
controller.deleteCita = async (req, res) => {
    let conn;
    try {
        const id = req.params.id;
        conn = await database.getConnection();
        await conn.execute(
            "UPDATE CITAS SET ESTADO = 'CANCELADA' WHERE ID_CITA = :id",
            [id], { autoCommit: true }
        );
        res.json({ message: "Cita cancelada" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if(conn) { try { await conn.close(); } catch(e){} }
    }
};

// ==================================================================
// 7. VERIFICAR DISPONIBILIDAD DE HORARIO
// ==================================================================
controller.getDisponibilidad = async (req, res) => {
    let conn;
    try {
        const { id_medico, fecha, hora_inicio, hora_fin, id_cita } = req.query;

        // Si no se especifica hora_inicio, devolver todas las citas del día
        if(!id_medico || !fecha) {
            return res.json({ citas: [], mensaje: 'Parámetros insuficientes' });
        }

        if(!hora_inicio) {
            // Devolver todas las citas del día para este médico
            conn = await database.getConnection();
            const sql = `
                SELECT c.ID_CITA, c.HORA_INICIO, c.HORA_FIN,
                       p.NOMBRES || ' ' || p.APELLIDO_PATERNO AS PACIENTE,
                       c.ESTADO
                FROM CITAS c
                JOIN PACIENTES p ON c.ID_PACIENTE = p.ID_PACIENTE
                WHERE c.ID_MEDICO = :med
                  AND TRUNC(c.FECHA_CITA) = TO_DATE(:fecha, 'YYYY-MM-DD')
                  AND UPPER(c.ESTADO) NOT IN ('CANCELADA', 'ELIMINADA')
                ORDER BY c.HORA_INICIO
            `;

            const result = await conn.execute(sql, { med: id_medico, fecha: fecha }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            return res.json({ citas: result.rows, mensaje: 'Citas del día obtenidas' });
        }

        // Verificar disponibilidad de un horario específico
        conn = await database.getConnection();

        let horaFinValidar = hora_fin || hora_inicio;
        if(!hora_fin) {
            const [h, m] = hora_inicio.split(':');
            const minutos = parseInt(m) + 30;
            const horas = parseInt(h) + Math.floor(minutos / 60);
            horaFinValidar = `${String(horas % 24).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
        }

        const checkSql = `
            SELECT c.HORA_INICIO, p.NOMBRES || ' ' || p.APELLIDO_PATERNO AS PACIENTE
            FROM CITAS c
            JOIN PACIENTES p ON c.ID_PACIENTE = p.ID_PACIENTE
            WHERE c.ID_MEDICO = :med
              AND TRUNC(c.FECHA_CITA) = TO_DATE(:fecha, 'YYYY-MM-DD')
              AND UPPER(c.ESTADO) NOT IN ('CANCELADA', 'ELIMINADA')
              ${id_cita ? 'AND c.ID_CITA != :id_cita' : ''}
              AND (
                  (:hora_ini >= c.HORA_INICIO AND :hora_ini < c.HORA_FIN) OR
                  (:hora_fin > c.HORA_INICIO AND :hora_fin <= c.HORA_FIN) OR
                  (:hora_ini <= c.HORA_INICIO AND :hora_fin >= c.HORA_FIN)
              )
        `;

        const binds = {
            med: id_medico, fecha: fecha,
            hora_ini: hora_inicio, hora_fin: horaFinValidar
        };
        if(id_cita) binds.id_cita = parseInt(id_cita);

        const ocupado = await conn.execute(checkSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        if(ocupado.rows.length > 0) {
            const c = ocupado.rows[0];
            return res.json({
                disponible: false,
                mensaje: `Ocupado: ${c.HORA_INICIO} con ${c.PACIENTE}`
            });
        }

        res.json({ disponible: true, mensaje: 'Horario disponible' });

    } catch (e) {
        console.error("Error getDisponibilidad:", e);
        res.json({ disponible: true, mensaje: '', error: e.message });
    } finally {
        if(conn) { try { await conn.close(); } catch(e){} }
    }
};

module.exports = controller;