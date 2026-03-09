/**
 * CONTROLADOR DE REPORTES (NIVEL GERENCIAL) - VERSIÓN FINAL
 * Ubicación: backend/src/controllers/reportesController.js
 */

const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const oracledb = require('oracledb');
const dbConfig = require('../config/database');

async function getConn() { return await dbConfig.getConnection(); }
const safeNum = (v) => v ? parseFloat(v) : 0;

const controller = {};

// ==================================================================
// 1. DASHBOARD KPIs (Tarjetas)
// ==================================================================
controller.getDashboardKPI = async (req, res) => {
    let conn;
    try {
        res.setHeader('Cache-Control', 'no-store');
        conn = await getConn();

        // 1. INGRESOS (Mes Actual vs Anterior)
        const sqlIngresos = `
            SELECT 
                NVL(SUM(CASE WHEN TRUNC(FECHA_EMISION, 'MM') = TRUNC(SYSDATE, 'MM') THEN TOTAL ELSE 0 END), 0) AS MES_ACTUAL,
                NVL(SUM(CASE WHEN TRUNC(FECHA_EMISION, 'MM') = TRUNC(ADD_MONTHS(SYSDATE, -1), 'MM') THEN TOTAL ELSE 0 END), 0) AS MES_ANTERIOR
            FROM FACTURAS WHERE ESTADO = 'PAGADA'
        `;
        const resIng = await conn.execute(sqlIngresos, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const act = safeNum(resIng.rows[0].MES_ACTUAL);
        const ant = safeNum(resIng.rows[0].MES_ANTERIOR);
        const varIng = ant === 0 ? (act > 0 ? 100 : 0) : ((act - ant) / ant) * 100;

        // 2. CITAS (Mes Actual)
        const resCitas = await conn.execute(
            `SELECT COUNT(*) AS TOTAL FROM CITAS WHERE TRUNC(FECHA_CITA, 'MM') = TRUNC(SYSDATE, 'MM') AND ESTADO IN ('ATENDIDA','FINALIZADA')`,
            [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const cantCitas = safeNum(resCitas.rows[0].TOTAL);

        // 3. PACIENTES ACTIVOS TOTALES (no solo nuevos del mes)
        const resPacActivos = await conn.execute(
            `SELECT COUNT(*) AS TOTAL FROM PACIENTES WHERE UPPER(ESTADO) = 'ACTIVO'`,
            [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const cantPacActivos = safeNum(resPacActivos.rows[0].TOTAL);
        
        // 3b. PACIENTES NUEVOS DEL MES (para estadísticas adicionales)
        const resPacNuevos = await conn.execute(
            `SELECT COUNT(*) AS TOTAL FROM PACIENTES WHERE TRUNC(FECHA_REGISTRO, 'MM') = TRUNC(SYSDATE, 'MM')`,
            [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const cantPacNuevos = safeNum(resPacNuevos.rows[0].TOTAL);

        // 4. CITAS DE HOY (adicional para el dashboard)
        const resCitasHoy = await conn.execute(
            `SELECT COUNT(*) AS TOTAL FROM CITAS WHERE TRUNC(FECHA_CITA) = TRUNC(SYSDATE)`,
            [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const citasHoy = safeNum(resCitasHoy.rows[0].TOTAL);
        
        // 5. INGRESOS DEL DÍA (adicional para el dashboard)
        const resIngresosDia = await conn.execute(
            `SELECT NVL(SUM(TOTAL), 0) AS TOTAL FROM FACTURAS WHERE TRUNC(FECHA_EMISION) = TRUNC(SYSDATE) AND ESTADO = 'PAGADA'`,
            [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const ingresosDia = safeNum(resIngresosDia.rows[0].TOTAL);
        
        // 6. STOCK BAJO
        const resStockBajo = await conn.execute(
            `SELECT COUNT(DISTINCT i.ID_PRODUCTO) AS TOTAL 
             FROM INVENTARIO i 
             JOIN PRODUCTOS p ON i.ID_PRODUCTO = p.ID_PRODUCTO 
             WHERE i.CANTIDAD_ACTUAL <= p.STOCK_MINIMO AND UPPER(p.ESTADO) = 'ACTIVO'`,
            [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const stockBajo = safeNum(resStockBajo.rows[0].TOTAL);

        // 7. TICKET PROMEDIO
        const ticket = cantCitas > 0 ? (act / cantCitas) : 0;

        res.json({
            ingresos: { valor: act, variacion: varIng.toFixed(1) },
            ingresosDia: ingresosDia, // Ingresos del día actual
            citas: { valor: cantCitas, variacion: 0 }, // Citas del mes
            citasHoy: citasHoy, // Citas de hoy
            pacientes: cantPacActivos, // Pacientes activos totales (número directo para compatibilidad)
            pacientesNuevos: cantPacNuevos, // Pacientes nuevos del mes
            stock_bajo: stockBajo, // Stock bajo
            ticket: { valor: ticket }
        });

    } catch (e) {
        console.error("Error KPIs:", e);
        res.status(500).json({ error: e.message });
    } finally {
        if (conn) await conn.close();
    }
};

// ==================================================================
// 2. DATOS PARA GRÁFICOS
// ==================================================================
controller.getDatosGraficos = async (req, res) => {
    let conn;
    try {
        conn = await getConn();

        // 1. TENDENCIA SEMANAL (Últimas 7 semanas completas)
        // Generar las 7 semanas incluso si no hay datos para mostrar una línea completa
        const sqlTendencia = `
            WITH semanas_base AS (
                SELECT 
                    LEVEL AS semana_num,
                    TRUNC(SYSDATE) - (LEVEL - 1) * 7 AS fecha_inicio_semana
                FROM DUAL
                CONNECT BY LEVEL <= 7
            ),
            ingresos_semanales AS (
                SELECT 
                    TO_CHAR(TRUNC(FECHA_EMISION, 'IW'), 'IW') AS SEMANA,
                    TRUNC(FECHA_EMISION, 'IW') AS FECHA_INICIO,
                    TRUNC(FECHA_EMISION, 'IW') + 6 AS FECHA_FIN,
                    NVL(SUM(TOTAL), 0) AS TOTAL
                FROM FACTURAS
                WHERE FECHA_EMISION >= TRUNC(SYSDATE) - 49 
                  AND FECHA_EMISION < TRUNC(SYSDATE) + 1
                  AND ESTADO = 'PAGADA'
                GROUP BY 
                    TO_CHAR(TRUNC(FECHA_EMISION, 'IW'), 'IW'),
                    TRUNC(FECHA_EMISION, 'IW')
            )
            SELECT 
                TO_CHAR(sb.fecha_inicio_semana, 'IW') AS SEMANA,
                TO_CHAR(sb.fecha_inicio_semana, 'DD/MM') AS FECHA_INICIO,
                TO_CHAR(sb.fecha_inicio_semana + 6, 'DD/MM') AS FECHA_FIN,
                TO_CHAR(sb.fecha_inicio_semana, 'DD/MM') || ' - ' || TO_CHAR(sb.fecha_inicio_semana + 6, 'DD/MM') AS PERIODO,
                NVL(isw.TOTAL, 0) AS TOTAL
            FROM semanas_base sb
            LEFT JOIN ingresos_semanales isw ON TO_CHAR(sb.fecha_inicio_semana, 'IW') = isw.SEMANA
            ORDER BY sb.semana_num DESC
        `;
        const tendencia = await conn.execute(sqlTendencia, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        // 2. ESPECIALIDADES (Top 5)
        const sqlEsp = `
            SELECT * FROM (
                SELECT u.ESPECIALIDAD, COUNT(c.ID_CITA) AS CANTIDAD
                FROM CITAS c JOIN USUARIOS u ON c.ID_MEDICO = u.ID_USUARIO
                WHERE c.ESTADO != 'CANCELADA'
                GROUP BY u.ESPECIALIDAD
                ORDER BY CANTIDAD DESC
            ) WHERE ROWNUM <= 5
        `;
        const especialidad = await conn.execute(sqlEsp, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        // 3. MÉTODOS PAGO
        const sqlMetodos = `
            SELECT METODO_PAGO, SUM(TOTAL) AS TOTAL FROM FACTURAS 
            WHERE ESTADO = 'PAGADA' GROUP BY METODO_PAGO
        `;
        const metodos = await conn.execute(sqlMetodos, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        // 4. COMPARATIVA CITAS VS PACIENTES (Últimos 6 meses)
        const sqlComparativa = `
            WITH meses_base AS (
                SELECT 
                    ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -LEVEL + 1) AS mes_inicio,
                    ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -LEVEL + 1) AS mes_fin
                FROM DUAL
                CONNECT BY LEVEL <= 6
            )
            SELECT 
                TO_CHAR(mb.mes_inicio, 'MM/YYYY') AS PERIODO,
                TO_CHAR(mb.mes_inicio, 'Mon YYYY') AS PERIODO_LABEL,
                NVL(citas.CANTIDAD, 0) AS CITAS,
                NVL(pacientes.CANTIDAD, 0) AS PACIENTES
            FROM meses_base mb
            LEFT JOIN (
                SELECT 
                    TRUNC(FECHA_CITA, 'MM') AS MES,
                    COUNT(*) AS CANTIDAD
                FROM CITAS
                WHERE ESTADO IN ('ATENDIDA', 'FINALIZADA')
                GROUP BY TRUNC(FECHA_CITA, 'MM')
            ) citas ON mb.mes_inicio = citas.MES
            LEFT JOIN (
                SELECT 
                    TRUNC(FECHA_REGISTRO, 'MM') AS MES,
                    COUNT(*) AS CANTIDAD
                FROM PACIENTES
                WHERE UPPER(ESTADO) = 'ACTIVO'
                GROUP BY TRUNC(FECHA_REGISTRO, 'MM')
            ) pacientes ON mb.mes_inicio = pacientes.MES
            ORDER BY mb.mes_inicio DESC
        `;
        const comparativa = await conn.execute(sqlComparativa, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });

        res.json({
            tendencia: tendencia.rows,
            especialidad: especialidad.rows,
            metodos: metodos.rows,
            comparativa: comparativa.rows
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error gráficos' });
    } finally {
        if (conn) await conn.close();
    }
};

// ==================================================================
// 3. EXPORTAR PDF
// ==================================================================
controller.exportarPDF = async (req, res) => {
    let conn;
    try {
        const doc = new PDFDocument({ margin: 50 });
        const { tipo, fecha_inicio, fecha_fin } = req.query;
        
        conn = await getConn();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Reporte_${tipo}.pdf`);
        doc.pipe(res);

        // Header
        doc.fontSize(20).text('CENTRO MÉDICO', { align: 'center' });
        doc.fontSize(12).text(`Reporte: ${tipo.toUpperCase()}`, { align: 'center' });
        doc.moveDown();

        // Query Dinámica
        if (tipo === 'ingresos_detallados' || tipo === 'financiero') {
            let sql = `SELECT NUMERO_FACTURA, FECHA_EMISION, TOTAL, ESTADO FROM FACTURAS WHERE 1=1`;
            const binds = {};
            
            if (fecha_inicio && fecha_fin) {
                sql += ` AND TRUNC(FECHA_EMISION) BETWEEN TO_DATE(:fi, 'YYYY-MM-DD') AND TO_DATE(:ff, 'YYYY-MM-DD')`;
                binds.fi = fecha_inicio;
                binds.ff = fecha_fin;
            }
            sql += ` ORDER BY FECHA_EMISION DESC`;

            const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

            // Tabla Simple
            let y = doc.y + 20;
            doc.fontSize(10);
            doc.text('Factura', 50, y);
            doc.text('Fecha', 150, y);
            doc.text('Estado', 300, y);
            doc.text('Monto', 450, y);
            
            y += 20;
            doc.moveTo(50, y).lineTo(500, y).stroke();
            y += 10;

            let total = 0;
            result.rows.forEach(r => {
                if (y > 700) { doc.addPage(); y = 50; }
                const fecha = r.FECHA_EMISION ? new Date(r.FECHA_EMISION).toLocaleDateString() : '';
                doc.text(r.NUMERO_FACTURA, 50, y);
                doc.text(fecha, 150, y);
                doc.text(r.ESTADO, 300, y);
                doc.text(r.TOTAL.toFixed(2), 450, y);
                if(r.ESTADO === 'PAGADA') total += r.TOTAL;
                y += 15;
            });

            doc.moveDown();
            doc.font('Helvetica-Bold').text(`TOTAL INGRESOS: Bs. ${total.toFixed(2)}`, { align: 'right' });
        }

        doc.end();

    } catch (e) {
        console.error(e);
        res.status(500).send('Error PDF');
    } finally {
        if(conn) await conn.close();
    }
};

// ==================================================================
// 4. EXPORTAR EXCEL
// ==================================================================
controller.exportarExcel = async (req, res) => {
    let conn;
    try {
        const { tipo, fecha_inicio, fecha_fin } = req.query;
        conn = await getConn();
        
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Datos');

        if (tipo === 'inventario') {
            const sql = `SELECT CODIGO_PRODUCTO, NOMBRE_PRODUCTO, STOCK_MINIMO, PRECIO_VENTA FROM PRODUCTOS`;
            const result = await conn.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
            
            sheet.columns = [
                { header: 'Código', key: 'CODIGO_PRODUCTO' },
                { header: 'Nombre', key: 'NOMBRE_PRODUCTO' },
                { header: 'Precio', key: 'PRECIO_VENTA' }
            ];
            result.rows.forEach(r => sheet.addRow(r));
        } else {
            // Financiero
            let sql = `SELECT NUMERO_FACTURA, FECHA_EMISION, TOTAL, ESTADO FROM FACTURAS WHERE 1=1`;
            const binds = {};
            if(fecha_inicio && fecha_fin) {
                sql += ` AND TRUNC(FECHA_EMISION) BETWEEN TO_DATE(:fi, 'YYYY-MM-DD') AND TO_DATE(:ff, 'YYYY-MM-DD')`;
                binds.fi = fecha_inicio;
                binds.ff = fecha_fin;
            }
            const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            
            sheet.columns = [
                { header: 'Nro', key: 'NUMERO_FACTURA' },
                { header: 'Fecha', key: 'FECHA_EMISION' },
                { header: 'Total', key: 'TOTAL' },
                { header: 'Estado', key: 'ESTADO' }
            ];
            result.rows.forEach(r => sheet.addRow(r));
        }

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=Reporte.xlsx');
        await workbook.xlsx.write(res);
        res.end();

    } catch (e) {
        console.error(e);
        res.status(500).send('Error Excel');
    } finally {
        if(conn) await conn.close();
    }
};

// ==================================================================
// 5. HISTORIAL DE CAJAS (ARQUEOS) - Solo sesiones cerradas (Corte Z)
// Matemática anti-trampas: Monto Teórico = Inicial + Ventas; Diferencia = Declarado - Teórico
// ==================================================================
controller.getHistorialCajas = async (req, res) => {
    let conn;
    try {
        res.setHeader('Cache-Control', 'no-store');
        conn = await getConn();
        const { fecha_inicio, fecha_fin } = req.query;

        let whereClause = "UPPER(s.ESTADO) = 'CERRADA'";
        const binds = {};
        if (fecha_inicio) {
            whereClause += " AND TRUNC(s.FECHA_CIERRE) >= TO_DATE(:fi, 'YYYY-MM-DD')";
            binds.fi = fecha_inicio;
        }
        if (fecha_fin) {
            whereClause += " AND TRUNC(s.FECHA_CIERRE) <= TO_DATE(:ff, 'YYYY-MM-DD')";
            binds.ff = fecha_fin;
        }

        // Arqueo: Monto Teórico Efectivo = Inicial + Ventas Efectivo + Ingresos Caja Chica - Egresos Caja Chica
        const sql = `
            SELECT s.ID_SESION,
                   TO_CHAR(s.FECHA_APERTURA, 'DD/MM/YYYY HH24:MI') AS FECHA_APERTURA,
                   TO_CHAR(s.FECHA_CIERRE, 'DD/MM/YYYY HH24:MI') AS FECHA_CIERRE,
                   s.MONTO_INICIAL,
                   s.MONTO_FINAL AS MONTO_DECLARADO,
                   (u.NOMBRES || ' ' || u.APELLIDO_PATERNO) AS CAJERO,
                   NVL(v.VENTAS_EFECTIVO, 0) AS VENTAS_SISTEMA,
                   NVL(v.INGRESOS_EXTRA, 0) AS INGRESOS_EXTRA,
                   NVL(v.EGRESOS_EXTRA, 0) AS EGRESOS_EXTRA,
                   (NVL(s.MONTO_INICIAL, 0) + NVL(v.VENTAS_EFECTIVO, 0) + NVL(v.INGRESOS_EXTRA, 0) - NVL(v.EGRESOS_EXTRA, 0)) AS MONTO_TEORICO,
                   (NVL(s.MONTO_FINAL, 0) - (NVL(s.MONTO_INICIAL, 0) + NVL(v.VENTAS_EFECTIVO, 0) + NVL(v.INGRESOS_EXTRA, 0) - NVL(v.EGRESOS_EXTRA, 0))) AS DIFERENCIA
            FROM SESIONES_CAJA s
            JOIN USUARIOS u ON s.ID_USUARIO = u.ID_USUARIO
            LEFT JOIN (
                SELECT ID_SESION,
                       NVL(SUM(CASE WHEN NUMERO_FACTURA NOT LIKE 'MOV-%' AND UPPER(METODO_PAGO) = 'EFECTIVO' AND UPPER(ESTADO) = 'PAGADA' THEN TOTAL ELSE 0 END), 0) AS VENTAS_EFECTIVO,
                       NVL(SUM(CASE WHEN NUMERO_FACTURA LIKE 'MOV-INGRESO%' THEN ABS(NVL(TOTAL,0)) ELSE 0 END), 0) AS INGRESOS_EXTRA,
                       NVL(SUM(CASE WHEN NUMERO_FACTURA LIKE 'MOV-EGRESO%' THEN ABS(NVL(TOTAL,0)) ELSE 0 END), 0) AS EGRESOS_EXTRA
                FROM FACTURAS
                GROUP BY ID_SESION
            ) v ON v.ID_SESION = s.ID_SESION
            WHERE ${whereClause}
            ORDER BY s.FECHA_CIERRE DESC
        `;
        const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const filas = (result.rows || []).map(r => ({
            id_sesion: r.ID_SESION,
            fecha_apertura: r.FECHA_APERTURA,
            fecha_cierre: r.FECHA_CIERRE,
            cajero: r.CAJERO,
            monto_inicial: safeNum(r.MONTO_INICIAL),
            ventas_sistema: safeNum(r.VENTAS_EFECTIVO || r.VENTAS_SISTEMA),
            ingresos_extra: safeNum(r.INGRESOS_EXTRA),
            egresos_extra: safeNum(r.EGRESOS_EXTRA),
            monto_teorico: safeNum(r.MONTO_TEORICO),
            monto_declarado: safeNum(r.MONTO_DECLARADO),
            diferencia: safeNum(r.DIFERENCIA)
        }));
        res.json({ arqueos: filas });
    } catch (e) {
        console.error("Error getHistorialCajas:", e);
        res.status(500).json({ error: e.message });
    } finally {
        if (conn) await conn.close();
    }
};

module.exports = controller;