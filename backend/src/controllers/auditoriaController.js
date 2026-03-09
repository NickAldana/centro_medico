/**
 * CONTROLADOR DE AUDITORÍA (BITÁCORA) - FULL BLINDADO
 * Intercepta y filtra correctamente toda la información
 */

const oracledb = require('oracledb');
const ExcelJS = require('exceljs');
const database = require('../utils'); 

const controller = {};
const safeStr = (v) => v ? String(v) : '';

// Helper interno para generar la cláusula WHERE (Reutilizable para tabla y Excel)
function buildWhereClause(query) {
    const { search, id_usuario, accion, modulo, fecha_inicio, fecha_fin } = query;
    const whereParts = ["1=1"];
    const binds = {};

    if (id_usuario && id_usuario !== 'TODOS') {
        whereParts.push("b.ID_USUARIO = :id_usuario");
        binds.id_usuario = parseInt(id_usuario);
    }
    if (accion && accion !== 'TODOS') {
        whereParts.push("UPPER(b.ACCION) = :accion");
        binds.accion = accion.toUpperCase();
    }
    if (modulo && modulo !== 'TODAS' && modulo !== 'TODOS') {
        whereParts.push("UPPER(b.MODULO) = :modulo");
        binds.modulo = modulo.toUpperCase();
    }
    if (search) {
        binds.searchRaw = `%${search.toUpperCase()}%`;
        whereParts.push("(UPPER(b.DESCRIPCION) LIKE :searchRaw OR UPPER(b.ACCION) LIKE :searchRaw OR UPPER(b.MODULO) LIKE :searchRaw)");
    }
    if (fecha_inicio) {
        whereParts.push("TRUNC(b.FECHA_REGISTRO) >= TO_DATE(:fi, 'YYYY-MM-DD')");
        binds.fi = fecha_inicio;
    }
    if (fecha_fin) {
        whereParts.push("TRUNC(b.FECHA_REGISTRO) <= TO_DATE(:ff, 'YYYY-MM-DD')");
        binds.ff = fecha_fin;
    }

    return { whereClause: `WHERE ${whereParts.join(' AND ')}`, binds };
}

// ==================================================================
// 1. OBTENER BITÁCORA (LISTADO PAGINADO)
// ==================================================================
controller.getBitacora = async (req, res) => {
    let conn;
    try {
        conn = await database.getConnection();

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const maxRow = offset + limit;

        const { whereClause, binds } = buildWhereClause(req.query);

        // 1. Count Total
        const countQuery = `SELECT COUNT(*) AS TOTAL FROM BITACORA_ACCESOS b ${whereClause}`;
        const countRes = await conn.execute(countQuery, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const total = countRes.rows?.[0]?.TOTAL || 0;

        // 2. Data
        const dataBinds = { ...binds, maxRow, offset };
        const dataQuery = `
            SELECT * FROM (
                SELECT a.*, ROWNUM rnum FROM (
                    SELECT b.ID_BITACORA, b.FECHA_REGISTRO, b.IP_ADDRESS, b.ACCION, b.MODULO, b.DESCRIPCION,
                           (u.NOMBRES || ' ' || u.APELLIDO_PATERNO || ' ' || NVL(u.APELLIDO_MATERNO, '')) AS USUARIO,
                           u.NOMBRE_USUARIO
                    FROM BITACORA_ACCESOS b
                    LEFT JOIN USUARIOS u ON b.ID_USUARIO = u.ID_USUARIO
                    ${whereClause}
                    ORDER BY b.FECHA_REGISTRO DESC
                ) a WHERE ROWNUM <= :maxRow
            ) WHERE rnum > :offset
        `;

        const result = await conn.execute(dataQuery, dataBinds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const registros = result.rows.map(r => ({
            id_bitacora: r.ID_BITACORA,
            fecha_registro: r.FECHA_REGISTRO,
            usuario: safeStr(r.USUARIO).trim() || 'Sistema',
            nombre_usuario: safeStr(r.NOMBRE_USUARIO),
            ip_address: safeStr(r.IP_ADDRESS),
            accion: safeStr(r.ACCION),
            modulo: safeStr(r.MODULO),
            descripcion: safeStr(r.DESCRIPCION)
        }));

        const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

        res.json({ registros, pagination: { page, limit, total, totalPages } });

    } catch (error) {
        console.error('Error GET /auditoria:', error);
        res.status(500).json({ error: 'Error interno', detail: error.message });
    } finally {
        if (conn) await conn.close();
    }
};

// ==================================================================
// 2. RESUMEN KPI
// ==================================================================
controller.getResumenAuditoria = async (req, res) => {
    let conn;
    try {
        conn = await database.getConnection();
        const sql = `
            SELECT 
                (SELECT COUNT(*) FROM BITACORA_ACCESOS) AS TOTAL,
                (SELECT COUNT(*) FROM BITACORA_ACCESOS WHERE UPPER(ACCION) LIKE '%LOGIN%') AS LOGINS,
                (SELECT COUNT(*) FROM BITACORA_ACCESOS WHERE UPPER(ACCION) IN ('INSERT','UPDATE','DELETE','CREAR','EDITAR','ELIMINAR')) AS MODS,
                (SELECT COUNT(DISTINCT ID_USUARIO) FROM BITACORA_ACCESOS WHERE FECHA_REGISTRO >= SYSDATE - 30) AS ACTIVOS
            FROM DUAL
        `;
        const result = await conn.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const stats = result.rows[0];

        res.json({
            total_registros: stats.TOTAL || 0,
            inicios_sesion: stats.LOGINS || 0,
            modificaciones: stats.MODS || 0,
            usuarios_activos: stats.ACTIVOS || 0
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    } finally {
        if(conn) await conn.close();
    }
};

// ==================================================================
// 3. AUXILIARES PARA LOS COMBOS
// ==================================================================
controller.getAcciones = async (req, res) => {
    let conn;
    try {
        conn = await database.getConnection();
        const result = await conn.execute("SELECT DISTINCT ACCION FROM BITACORA_ACCESOS WHERE ACCION IS NOT NULL ORDER BY ACCION", [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        res.json(result.rows.map(d => d.ACCION));
    } catch (e) { res.status(500).json({ error: e.message }); }
    finally { if(conn) await conn.close(); }
};

controller.getModulos = async (req, res) => {
    let conn;
    try {
        conn = await database.getConnection();
        const result = await conn.execute("SELECT DISTINCT MODULO FROM BITACORA_ACCESOS WHERE MODULO IS NOT NULL ORDER BY MODULO", [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        res.json(result.rows.map(d => d.MODULO));
    } catch (e) { res.status(500).json({ error: e.message }); }
    finally { if(conn) await conn.close(); }
};

// ==================================================================
// 4. EXPORTAR EXCEL (CON FILTROS APLICADOS)
// ==================================================================
controller.exportarBitacora = async (req, res) => {
    let conn;
    try {
        conn = await database.getConnection();
        
        // Reutilizamos la misma función de filtros para que el Excel sea exacto
        const { whereClause, binds } = buildWhereClause(req.query);
        
        const query = `
            SELECT b.ID_BITACORA, b.FECHA_REGISTRO, 
                   (u.NOMBRES || ' ' || u.APELLIDO_PATERNO) AS NOMBRE_USUARIO, 
                   b.ACCION, b.MODULO, b.DESCRIPCION, b.IP_ADDRESS
            FROM BITACORA_ACCESOS b
            LEFT JOIN USUARIOS u ON b.ID_USUARIO = u.ID_USUARIO
            ${whereClause}
            ORDER BY b.FECHA_REGISTRO DESC
        `;

        const result = await conn.execute(query, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const logs = result.rows;

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Auditoría y Bitácora');

        // Diseño del Excel
        sheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Fecha y Hora', key: 'fecha', width: 22 },
            { header: 'Usuario', key: 'usuario', width: 30 },
            { header: 'Acción', key: 'accion', width: 18 },
            { header: 'Módulo', key: 'modulo', width: 18 },
            { header: 'Descripción', key: 'desc', width: 60 },
            { header: 'IP Origen', key: 'ip', width: 18 }
        ];

        // Estilos de cabecera
        sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0066CC' } };

        logs.forEach(l => {
            const fechaFmt = l.FECHA_REGISTRO ? new Date(l.FECHA_REGISTRO).toLocaleString('es-BO') : '-';
            sheet.addRow({
                id: l.ID_BITACORA,
                fecha: fechaFmt,
                usuario: l.NOMBRE_USUARIO || 'Sistema',
                accion: l.ACCION,
                modulo: l.MODULO,
                desc: l.DESCRIPCION,
                ip: l.IP_ADDRESS
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Auditoria_${Date.now()}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Error exportar:', error);
        res.status(500).send('Error generando archivo Excel');
    } finally {
        if(conn) await conn.close();
    }
};

module.exports = controller;