// backend/src/controllers/dashboardController.js
// DASHBOARD - Controlador Principal (Normaliza claves de Oracle y gestiona errores)

const { selectOne, selectAll } = require('../utils');

// Función para convertir las claves que devuelve Oracle (generalmente MAYÚSCULAS) a minúsculas
function normalizeRowKeys(row) {
    if (!row || typeof row !== 'object') return row;
    const out = {};
    Object.keys(row).forEach(k => {
        out[k.toLowerCase()] = row[k];
    });
    return out;
}

// Aplica la normalización a una lista de filas
function normalizeRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map(r => normalizeRowKeys(r));
}

exports.getStats = async (req, res) => {
    // Estructura base de respuesta (valores por defecto en 0 o vacíos)
    const stats = {
        citasHoy: 0,
        citasVariacion: 0,
        pacientes: 0,
        pacientesVariacion: 0,
        ingresosDia: 0,
        ingresosVariacion: 0,
        stockBajo: 0,
        ingresosSemana: [],
        serviciosTop: [],
        citasHoyDetalle: [],
        productosStockBajo: [], // Esta es la lista que te faltaba
        actividad: []
    };

    // Helper: Ejecuta una consulta única de forma segura
    async function safeSelectOne(sql, defaultValue = null) {
        try {
            const r = await selectOne(sql);
            return r;
        } catch (err) {
            console.error('Error en consulta selectOne:', sql, err.message);
            return defaultValue;
        }
    }

    // Helper: Ejecuta una consulta de lista de forma segura
    async function safeSelectAll(sql, defaultValue = []) {
        try {
            const r = await selectAll(sql);
            return r;
        } catch (err) {
            console.error('Error en consulta selectAll:', sql, err.message);
            return defaultValue;
        }
    }

    // ---------------------------------------------------------
    // 1. TARJETAS SUPERIORES (KPIs)
    // ---------------------------------------------------------

    // Citas de Hoy
    const citasHoyRaw = await safeSelectOne(`SELECT COUNT(*) AS TOTAL FROM CITAS WHERE TRUNC(FECHA_CITA) = TRUNC(SYSDATE)` , null);
    stats.citasHoy = Number(normalizeRowKeys(citasHoyRaw || {}).total || 0);

    // Variación de Citas (vs Ayer)
    const citasAyerRaw = await safeSelectOne(`SELECT COUNT(*) AS TOTAL FROM CITAS WHERE TRUNC(FECHA_CITA) = TRUNC(SYSDATE - 1)` , null);
    const citasAyerCount = Number(normalizeRowKeys(citasAyerRaw || {}).total || 0);
    stats.citasVariacion = citasAyerCount > 0 ? Number(((stats.citasHoy - citasAyerCount) / citasAyerCount * 100).toFixed(0)) : 0;

    // Total Pacientes Activos
    const pacientesRaw = await safeSelectOne(`SELECT COUNT(*) AS TOTAL FROM PACIENTES WHERE ESTADO = 'activo'`, null);
    stats.pacientes = Number(normalizeRowKeys(pacientesRaw || {}).total || 0);

    // Ingresos del Día
    const ingresosDiaRaw = await safeSelectOne(`SELECT NVL(SUM(TOTAL), 0) AS TOTAL FROM FACTURAS WHERE TRUNC(FECHA_EMISION) = TRUNC(SYSDATE) AND ESTADO = 'PAGADA'`, null);
    stats.ingresosDia = parseFloat(Number(normalizeRowKeys(ingresosDiaRaw || {}).total || 0)).toFixed(2);

    // Cantidad Numérica de Productos con Stock Bajo (Para el KPI, no la tabla)
    const stockBajoRaw = await safeSelectOne(`
        SELECT COUNT(DISTINCT i.ID_PRODUCTO) AS TOTAL 
        FROM INVENTARIO i 
        JOIN PRODUCTOS p ON i.ID_PRODUCTO = p.ID_PRODUCTO 
        WHERE i.CANTIDAD_ACTUAL <= p.STOCK_MINIMO AND p.ESTADO = 'activo'
    `, null);
    stats.stockBajo = Number(normalizeRowKeys(stockBajoRaw || {}).total || 0);


    // ---------------------------------------------------------
    // 2. GRÁFICOS
    // ---------------------------------------------------------

    // Ingresos de la última semana
    const ingresosSemanaRaw = await safeSelectAll(`
            SELECT 
                TO_CHAR(FECHA_EMISION, 'D') AS DIA_SEMANA,
                TO_CHAR(FECHA_EMISION, 'DY', 'NLS_DATE_LANGUAGE=SPANISH') AS DIA_NOMBRE,
                NVL(SUM(TOTAL), 0) AS TOTAL_DIA
            FROM FACTURAS
            WHERE FECHA_EMISION >= TRUNC(SYSDATE) - 6
              AND ESTADO = 'PAGADA'
            GROUP BY TO_CHAR(FECHA_EMISION, 'D'), TO_CHAR(FECHA_EMISION, 'DY', 'NLS_DATE_LANGUAGE=SPANISH')
            ORDER BY TO_CHAR(FECHA_EMISION, 'D')
        `, []);
    stats.ingresosSemana = normalizeRows(ingresosSemanaRaw || []);

    // Servicios más solicitados
    const serviciosTopRaw = await safeSelectAll(`
        SELECT c.ESPECIALIDAD, COUNT(*) AS CANTIDAD 
        FROM CITAS c 
        WHERE c.ESTADO IN ('finalizada', 'atendida', 'programada', 'confirmada') 
        AND c.FECHA_CITA >= TRUNC(SYSDATE) - 30 
        GROUP BY c.ESPECIALIDAD 
        ORDER BY CANTIDAD DESC FETCH NEXT 5 ROWS ONLY
    `, []);
    stats.serviciosTop = normalizeRows(serviciosTopRaw || []);


    // ---------------------------------------------------------
    // 3. TABLAS INFERIORES (AQUÍ ESTABA EL PROBLEMA)
    // ---------------------------------------------------------

    // TABLA: Citas de Hoy
    // Corrección: Usamos APELLIDO_PATERNO y formateamos la hora
    const citasHoyDetalleRaw = await safeSelectAll(`
        SELECT 
            c.ID_CITA, 
            TO_CHAR(c.FECHA_CITA, 'HH24:MI') AS HORA, 
            p.NOMBRES || ' ' || p.APELLIDO_PATERNO AS PACIENTE, 
            u.NOMBRES || ' ' || u.APELLIDO_PATERNO AS MEDICO, 
            c.ESPECIALIDAD, 
            c.ESTADO 
        FROM CITAS c 
        JOIN PACIENTES p ON c.ID_PACIENTE = p.ID_PACIENTE 
        JOIN USUARIOS u ON c.ID_MEDICO = u.ID_USUARIO 
        WHERE TRUNC(c.FECHA_CITA) = TRUNC(SYSDATE) 
        ORDER BY c.HORA_INICIO 
        FETCH NEXT 10 ROWS ONLY
    `, []);
    
    // Mapeo seguro para que el frontend reciba "hora"
    stats.citasHoyDetalle = normalizeRows(citasHoyDetalleRaw || []).map(row => ({
        ...row,
        hora: row.hora || row.hora_inicio 
    }));

    // TABLA: Productos con Stock Bajo (CORREGIDO)
    // Corrección: Usamos alias explícitos (CODIGO, NOMBRE, STOCK) para que el frontend lo entienda
    const productosStockBajoRaw = await safeSelectAll(`
            SELECT 
                p.CODIGO_PRODUCTO AS CODIGO, 
                p.NOMBRE_PRODUCTO AS NOMBRE, 
                SUM(i.CANTIDAD_ACTUAL) AS STOCK, 
                MIN(i.FECHA_VENCIMIENTO) AS VENCE
            FROM INVENTARIO i
            JOIN PRODUCTOS p ON i.ID_PRODUCTO = p.ID_PRODUCTO
            WHERE p.ESTADO = 'activo'
            GROUP BY p.CODIGO_PRODUCTO, p.NOMBRE_PRODUCTO, p.STOCK_MINIMO
            HAVING SUM(i.CANTIDAD_ACTUAL) <= p.STOCK_MINIMO
            ORDER BY STOCK ASC
            FETCH NEXT 5 ROWS ONLY
        `, []);
    
    // Mapeo manual para asegurar que los nombres de las variables coincidan
    stats.productosStockBajo = normalizeRows(productosStockBajoRaw || []).map(row => ({
        codigo: row.codigo || row.codigo_producto,
        nombre: row.nombre || row.nombre_producto,
        stock: row.stock || row.stock_actual, 
        vence: row.vence || row.fecha_vencimiento
    }));

    // TABLA: Actividad Reciente
    const actividadRaw = await safeSelectAll(`
        SELECT 
            b.FECHA_REGISTRO, 
            u.NOMBRES || ' ' || u.APELLIDO_PATERNO AS USUARIO, 
            b.ACCION, 
            b.MODULO, 
            b.DESCRIPCION 
        FROM BITACORA_ACCESOS b 
        LEFT JOIN USUARIOS u ON b.ID_USUARIO = u.ID_USUARIO 
        ORDER BY b.FECHA_REGISTRO DESC 
        FETCH NEXT 5 ROWS ONLY
    `, []);
    stats.actividad = normalizeRows(actividadRaw || []);

    // ---------------------------------------------------------
    // 4. RESPUESTA Y SANITIZACIÓN
    // ---------------------------------------------------------

    // Función para convertir tipos de datos complejos a string (ej. Fechas)
    function sanitizeValue(v) {
        if (v === null || v === undefined) return v;
        const t = typeof v;
        if (t === 'number' || t === 'string' || t === 'boolean') return v;
        if (v instanceof Date) return v.toISOString();
        if (Array.isArray(v)) return v.map(sanitizeValue);
        if (t === 'object') {
            const out = {};
            Object.keys(v).forEach(k => {
                try {
                    const val = v[k];
                    const vt = typeof val;
                    if (val === null || val === undefined) out[k] = val;
                    else if (vt === 'number' || vt === 'string' || vt === 'boolean') out[k.toLowerCase()] = val;
                    else if (val instanceof Date) out[k.toLowerCase()] = val.toISOString();
                    else out[k.toLowerCase()] = String(val);
                } catch (e) {
                    out[k] = null;
                }
            });
            return out;
        }
        return String(v);
    }

    const safeStats = {};
    Object.keys(stats).forEach(k => {
        safeStats[k] = sanitizeValue(stats[k]);
    });

    try {
        res.json(safeStats);
    } catch (err) {
        console.error('Error serializando stats para JSON:', err.message);
        res.json({ error: 'No se pudieron serializar las estadísticas' });
    }
};