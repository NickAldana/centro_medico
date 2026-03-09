/**
 * CONTROLADOR DE FACTURACIÓN - BLINDADO (v5.0)
 * Compatible con Oracle 11g/19c y Frontend Inteligente
 */
const oracledb = require('oracledb');
const dbConfig = require('../config/database');

async function getConn() { return await dbConfig.getConnection(); }

// Helpers de limpieza de datos
const safeInt = (v) => (v && v !== "" && !isNaN(v)) ? parseInt(v) : null;
const safeFloat = (v) => (v && v !== "" && !isNaN(v)) ? parseFloat(v) : 0;

// 1. OBTENER LISTA DE FACTURAS
exports.getFacturas = async (req, res) => {
    let conn;
    try {
        res.setHeader('Cache-Control', 'no-store');
        conn = await getConn();
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const { search, estado } = req.query;
        
        const whereParts = ["f.ESTADO != 'ELIMINADO'"];
        const whereBinds = {};

        if (estado) {
            whereParts.push("UPPER(f.ESTADO) = :estado");
            whereBinds.estado = estado.toUpperCase();
        }
        
        if (search) {
            whereBinds.searchRaw = `%${search.toUpperCase()}%`;
            whereParts.push(`(UPPER(f.NUMERO_FACTURA) LIKE :searchRaw OR UPPER(p.NOMBRES) LIKE :searchRaw)`);
        }
        
        const whereClause = `WHERE ${whereParts.join(' AND ')}`;
        
        // Count
        const countRes = await conn.execute(
            `SELECT COUNT(*) AS TOTAL FROM FACTURAS f JOIN PACIENTES p ON f.ID_PACIENTE = p.ID_PACIENTE ${whereClause}`,
            whereBinds
        );
        const total = countRes.rows[0][0]; 
        
        // Data
        const binds = { ...whereBinds, offset, limit };
        const query = `
            SELECT f.ID_FACTURA, f.NUMERO_FACTURA, f.FECHA_EMISION, f.ESTADO, f.METODO_PAGO, f.REFERENCIA_PAGO,
                   f.SUBTOTAL, f.DESCUENTO, f.IVA, f.TOTAL,
                   p.NOMBRES || ' ' || p.APELLIDO_PATERNO || ' ' || NVL(p.APELLIDO_MATERNO, '') AS PACIENTE_NOMBRE, 
                   p.CI AS PACIENTE_CI
            FROM FACTURAS f
            JOIN PACIENTES p ON f.ID_PACIENTE = p.ID_PACIENTE
            ${whereClause}
            ORDER BY f.ID_FACTURA DESC
            OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
        `;
        
        const result = await conn.execute(query, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        res.json({ 
            facturas: result.rows, 
            pagination: { page, limit, total, totalPages: Math.ceil(total/limit) } 
        });
        
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al listar facturas' });
    } finally {
        if (conn) await conn.close();
    }
};

// 2. CREAR FACTURA
// Prefijos para referencia de pago secuencial por método (id automático)
const PREFIJOS_METODO = {
    'EFECTIVO': 'EF',
    'TRANSFERENCIA': 'TR',
    'QR': 'QR',
    'TARJETA': 'TJ',
    'DEPOSITO': 'DP'
};
const PREFIJO_DEFAULT = 'PAG';

function prefijoParaMetodo(metodo) {
    const m = (metodo || '').toUpperCase().trim();
    return PREFIJOS_METODO[m] || PREFIJO_DEFAULT;
}

// Obtener siguiente referencia de pago (preview para el frontend)
async function obtenerSiguienteReferencia(conn, metodo) {
    const metodoFinal = (metodo || 'EFECTIVO').toUpperCase();
    const prefijo = prefijoParaMetodo(metodoFinal);
    let siguiente = 1;
    try {
        const seqRes = await conn.execute(
            `SELECT NVL(MAX(TO_NUMBER(REGEXP_SUBSTR(REFERENCIA_PAGO, '[0-9]+', 1))), 0) + 1 AS SIGUIENTE 
             FROM FACTURAS 
             WHERE UPPER(METODO_PAGO) = :met AND REFERENCIA_PAGO IS NOT NULL AND REFERENCIA_PAGO LIKE :pref || '-%'`,
            { met: metodoFinal, pref: prefijo },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (seqRes.rows && seqRes.rows[0] && seqRes.rows[0].SIGUIENTE != null) {
            siguiente = parseInt(seqRes.rows[0].SIGUIENTE, 10) || 1;
        }
    } catch (e) {}
    return `${prefijo}-${String(siguiente).padStart(6, '0')}`;
}

exports.getSiguienteReferencia = async (req, res) => {
    let conn;
    try {
        const metodo = req.query.metodo || 'EFECTIVO';
        conn = await getConn();
        const referencia_pago = await obtenerSiguienteReferencia(conn, metodo);
        res.json({ referencia_pago, metodo: (metodo || 'EFECTIVO').toUpperCase() });
    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (conn) await conn.close();
    }
};

exports.createFactura = async (req, res) => {
    let conn;
    try {
        const { id_paciente, detalles, metodo_pago, descuento, notas, estado, referencia_pago: refPagoManual, id_supervisor_autorizador, pagos } = req.body;
        
        if (!detalles || !detalles.length) return res.status(400).json({ error: 'Faltan detalles' });

        conn = await getConn();
        // Obtener usuario de la sesión o usar por defecto
        const usuario = req.user?.id_usuario || req.body.id_usuario || 1;
        
        // Verificar que haya sesión de caja abierta
        const sesionActiva = await conn.execute(
            "SELECT ID_SESION, FECHA_APERTURA FROM SESIONES_CAJA WHERE ESTADO = 'ABIERTA'",
            [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        if (sesionActiva.rows.length === 0) {
            return res.status(400).json({ error: 'No hay sesión de caja abierta. Debe abrir una sesión antes de facturar.' });
        }
        
        const idSesion = sesionActiva.rows[0].ID_SESION;
        
        // Solo se permite facturar si hay sesión abierta. No se bloquea por cierres
        // previos del día (si reabrieron caja, pueden seguir facturando).

        // Calcular Totales
        let subtotalCalc = 0;
        for (const det of detalles) {
            subtotalCalc += (safeFloat(det.cantidad) * safeFloat(det.precio_unitario));
        }
        
        const desc = safeFloat(descuento);
        const umbralDescuento = subtotalCalc * 0.10; // 10%
        let idAutorizador = null;
        if (desc > umbralDescuento && desc > 0) {
            // Permite: (1) id_supervisor_autorizador en body, o (2) usuario actual si es Admin
            const rolActual = (req.user?.nombre_rol || req.user?.rol || '').toUpperCase();
            const esAdmin = /ADMIN/.test(rolActual);
            idAutorizador = id_supervisor_autorizador || (esAdmin ? usuario : null);
            if (!idAutorizador) {
                return res.status(400).json({ 
                    error: 'Descuento mayor al 10% requiere autorización de supervisor.',
                    requiere_supervisor: true,
                    descuento_limite_sin_autorizacion: umbralDescuento.toFixed(2)
                });
            }
        }
        let notasFinal = (notas || '').trim();
        if (desc > umbralDescuento && desc > 0 && idAutorizador) {
            notasFinal += (notasFinal ? ' | ' : '') + `[Descuento autorizado por usuario ID: ${idAutorizador}]`;
        }
        const subFinal = Math.max(0, subtotalCalc - desc);
        const iva = subFinal * 0.13;
        const total = subFinal + iva;

        // Generar Número de Factura (robusto para Oracle OBJECT)
        const numRes = await conn.execute("SELECT NVL(MAX(ID_FACTURA), 0) + 1 AS NEXT_ID FROM FACTURAS");
        const firstRow = numRes.rows && numRes.rows[0];
        let nextId = 1;
        if (firstRow) {
            const val = firstRow.NEXT_ID ?? firstRow[Object.keys(firstRow)[0]] ?? Object.values(firstRow)[0];
            nextId = Math.max(1, parseInt(val, 10) || 1);
        }
        const numFactura = `FAC-${String(nextId).padStart(6, '0')}`;

        const estadoFinal = (estado || 'PAGADA').toUpperCase();
        const pagosDivididos = Array.isArray(pagos) && pagos.length > 1;
        const sumaPagos = pagosDivididos ? pagos.reduce((s, p) => s + safeFloat(p.monto), 0) : 0;
        if (pagosDivididos && Math.abs(sumaPagos - total) > 0.01) {
            return res.status(400).json({ error: 'La suma de los pagos divididos debe coincidir con el total.' });
        }
        const metodoFinal = pagosDivididos ? 'MIXTO' : (metodo_pago || 'EFECTIVO').toUpperCase();

        // Referencia de pago: obligatoria para QR/Transferencia
        let referenciaPago = (refPagoManual && String(refPagoManual).trim()) || null;
        const metodosElectronicos = ['QR', 'TRANSFERENCIA'];
        if (!pagosDivididos && metodosElectronicos.includes(metodoFinal) && !referenciaPago) {
            return res.status(400).json({ error: 'Para pagos con QR o Transferencia debe ingresar el número de referencia o comprobante.' });
        }
        if (!referenciaPago) {
            const primerMetodo = pagosDivididos ? (pagos[0]?.metodo_pago || 'EFECTIVO') : metodoFinal;
            referenciaPago = pagosDivididos ? 'MIXTO' : await obtenerSiguienteReferencia(conn, primerMetodo.toUpperCase());
        }

        // Insertar Cabecera (incluye REFERENCIA_PAGO)
        const sqlHead = `
            INSERT INTO FACTURAS (
                NUMERO_FACTURA, ID_PACIENTE, ID_USUARIO_CAJERO, ID_SESION, FECHA_EMISION,
                SUBTOTAL, DESCUENTO, IVA, TOTAL, ESTADO, METODO_PAGO, REFERENCIA_PAGO, NOTAS
            ) VALUES (
                :p_num, :p_pac, :p_usr, :p_ses, SYSDATE,
                :p_sub, :p_desc, :p_iva, :p_tot, :p_st, :p_met, :p_ref, :p_notas
            ) RETURNING ID_FACTURA INTO :id_out
        `;

        const resHead = await conn.execute(sqlHead, {
            p_num: numFactura,
            p_pac: safeInt(id_paciente),
            p_usr: usuario,
            p_ses: idSesion,
            p_sub: subtotalCalc,
            p_desc: desc,
            p_iva: iva,
            p_tot: total,
            p_st: estadoFinal,
            p_met: metodoFinal,
            p_ref: referenciaPago,
            p_notas: notasFinal || '',
            id_out: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }, { autoCommit: false });

        const idFactura = resHead.outBinds.id_out[0];

        // Pagos divididos: insertar en PAGOS_FACTURA si existe la tabla
        if (pagosDivididos && pagos.length) {
            try {
                for (const p of pagos) {
                    const refP = (p.referencia_pago || '').trim() || await obtenerSiguienteReferencia(conn, (p.metodo_pago || 'EFECTIVO').toUpperCase());
                    await conn.execute(
                        `INSERT INTO PAGOS_FACTURA (ID_PAGO, ID_FACTURA, METODO_PAGO, MONTO, REFERENCIA_PAGO) 
                         VALUES (seq_pago.NEXTVAL, :id_fact, :met, :monto, :ref)`,
                        { id_fact: idFactura, met: (p.metodo_pago || 'EFECTIVO').toUpperCase(), monto: safeFloat(p.monto), ref: refP },
                        { autoCommit: false }
                    );
                }
            } catch (e) {
                if (!e.message || !e.message.includes('ORA-00942')) throw e;
                // Tabla no existe - ignorar
            }
        }

        // Insertar Detalles
        for (const det of detalles) {
            const idProd = safeInt(det.id_producto);
            const idCita = safeInt(det.id_cita);
            const cant = safeFloat(det.cantidad);
            const precio = safeFloat(det.precio_unitario);
            
            await conn.execute(`
                INSERT INTO DETALLE_FACTURA (ID_FACTURA, ID_PRODUCTO, ID_CITA, DESCRIPCION_SERVICIO, CANTIDAD, PRECIO_UNITARIO, SUBTOTAL)
                VALUES (:p_fact, :p_prod, :p_cita, :p_descrip, :p_cant, :p_unit, :p_subt)
            `, {
                p_fact: idFactura,
                p_prod: idProd, 
                p_cita: idCita,
                p_descrip: det.descripcion || 'Servicio',
                p_cant: cant,
                p_unit: precio,
                p_subt: (cant * precio)
            }, { autoCommit: false });

            // Descontar Stock y registrar Movimiento de Salida (Solo si es PAGADA y es Producto)
            if (idProd && estadoFinal === 'PAGADA') {
                // Verificar stock suficiente
                const stockRes = await conn.execute(
                    `SELECT NVL(SUM(CANTIDAD_ACTUAL), 0) AS STOCK FROM INVENTARIO WHERE ID_PRODUCTO = :pid AND UPPER(NVL(ESTADO,'DISPONIBLE')) != 'ELIMINADO'`,
                    { pid: idProd }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );
                const stockActual = safeFloat(stockRes.rows[0]?.STOCK || 0);
                if (stockActual < cant) {
                    throw new Error(`Stock insuficiente para ${det.descripcion || 'producto'}: disponible ${stockActual}, requerido ${cant}`);
                }
                // Obtener lotes con stock (FIFO por vencimiento) para descontar
                const lotesRes = await conn.execute(
                    `SELECT ID_INVENTARIO, CANTIDAD_ACTUAL FROM INVENTARIO WHERE ID_PRODUCTO = :pid AND UPPER(NVL(ESTADO,'DISPONIBLE')) != 'ELIMINADO' AND CANTIDAD_ACTUAL > 0 ORDER BY FECHA_VENCIMIENTO ASC NULLS LAST`,
                    { pid: idProd }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );
                let resto = cant;
                for (const lot of lotesRes.rows || []) {
                    if (resto <= 0) break;
                    const idInv = lot.ID_INVENTARIO;
                    const dispLote = safeFloat(lot.CANTIDAD_ACTUAL);
                    const aDescontar = Math.min(resto, dispLote);
                    await conn.execute(
                        `UPDATE INVENTARIO SET CANTIDAD_ACTUAL = CANTIDAD_ACTUAL - :p_can, ULTIMO_MOVIMIENTO = SYSDATE WHERE ID_INVENTARIO = :id`,
                        { p_can: aDescontar, id: idInv },
                        { autoCommit: false }
                    );
                    await conn.execute(
                        `INSERT INTO MOVIMIENTOS_INVENTARIO (ID_INVENTARIO, ID_USUARIO, TIPO_MOVIMIENTO, CANTIDAD, MOTIVO, DOCUMENTO_REFERENCIA) VALUES (:id_inv, :usr, 'SALIDA', :cant, 'Venta facturada', :doc)`,
                        { id_inv: idInv, usr: usuario, cant: aDescontar, doc: numFactura },
                        { autoCommit: false }
                    );
                    resto -= aDescontar;
                }
            }
            
            // Cerrar Cita (Solo si es PAGADA)
            if (idCita && estadoFinal === 'PAGADA') {
                await conn.execute(
                    `UPDATE CITAS SET ESTADO = 'FINALIZADA', ID_FACTURA = :p_fid WHERE ID_CITA = :p_cid`,
                    { p_fid: idFactura, p_cid: idCita },
                    { autoCommit: false }
                );
            }
        }

        await conn.commit();
        res.status(201).json({ message: 'Creada', numero: numFactura, referencia_pago: referenciaPago });

    } catch (e) {
        if (conn) await conn.rollback();
        console.error('❌ Error DB:', e.message);
        res.status(500).json({ error: 'Error DB: ' + e.message });
    } finally {
        if (conn) await conn.close();
    }
};

// 3. OBTENER FACTURA (GET BY ID)
exports.getFacturaById = async (req, res) => {
    let conn;
    try {
        res.setHeader('Cache-Control', 'no-store');
        conn = await getConn();
        const id = req.params.id;

        const head = await conn.execute(
            `SELECT f.*, p.NOMBRES || ' ' || p.APELLIDO_PATERNO || ' ' || NVL(p.APELLIDO_MATERNO, '') AS PACIENTE_NOMBRE, p.CI, p.DIRECCION
             FROM FACTURAS f JOIN PACIENTES p ON f.ID_PACIENTE = p.ID_PACIENTE WHERE f.ID_FACTURA = :id`,
            [id], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (!head.rows.length) return res.status(404).json({ error: 'No encontrada' });

        const dets = await conn.execute(
            `SELECT * FROM DETALLE_FACTURA WHERE ID_FACTURA = :id`,
            [id], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const f = head.rows[0];
        res.json({
            id_factura: f.ID_FACTURA,
            numero: f.NUMERO_FACTURA,
            referencia_pago: f.REFERENCIA_PAGO,
            fecha: f.FECHA_EMISION,
            paciente: f.PACIENTE_NOMBRE,
            ci: f.CI,
            direccion: f.DIRECCION,
            total: f.TOTAL,
            subtotal: f.SUBTOTAL,
            iva: f.IVA,
            estado: f.ESTADO,
            metodo: f.METODO_PAGO,
            detalles: dets.rows.map(d => ({
                descripcion: d.DESCRIPCION_SERVICIO,
                cantidad: d.CANTIDAD,
                precio: d.PRECIO_UNITARIO,
                subtotal: d.SUBTOTAL
            }))
        });

    } catch (e) {
        res.status(500).json({ error: e.message });
    } finally {
        if (conn) await conn.close();
    }
};

// 4. ANULAR (con reversa de inventario: medicamentos vuelven al stock automáticamente)
exports.anularFactura = async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        const id = req.params.id;

        // Verificar que la factura existe y está PAGADA (para poder reponer)
        const factRes = await conn.execute(
            "SELECT NUMERO_FACTURA, ESTADO FROM FACTURAS WHERE ID_FACTURA = :id",
            [id], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (!factRes.rows.length) return res.status(404).json({ error: 'Factura no encontrada' });
        if (factRes.rows[0].ESTADO === 'ANULADA') return res.status(400).json({ error: 'La factura ya está anulada' });

        const numFactura = factRes.rows[0].NUMERO_FACTURA;

        // Obtener detalles con productos (para reponer inventario)
        const detsRes = await conn.execute(
            `SELECT ID_PRODUCTO, CANTIDAD FROM DETALLE_FACTURA WHERE ID_FACTURA = :id AND ID_PRODUCTO IS NOT NULL`,
            [id], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const usuario = req.user?.id_usuario || 1;

        // Reponer stock por cada producto vendido
        for (const det of detsRes.rows || []) {
            const idProd = det.ID_PRODUCTO;
            const cant = safeFloat(det.CANTIDAD);
            if (!idProd || cant <= 0) continue;

            // Obtener id_inventario (primer lote del producto; si no hay DISPONIBLE, cualquiera)
            const invRes = await conn.execute(
                `SELECT ID_INVENTARIO FROM (SELECT ID_INVENTARIO FROM INVENTARIO WHERE ID_PRODUCTO = :pid AND UPPER(NVL(ESTADO,'DISPONIBLE')) != 'ELIMINADO' ORDER BY FECHA_VENCIMIENTO ASC NULLS LAST) WHERE ROWNUM = 1`,
                { pid: idProd }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            if (invRes.rows.length > 0) {
                const idInv = invRes.rows[0].ID_INVENTARIO;
                await conn.execute(
                    `UPDATE INVENTARIO SET CANTIDAD_ACTUAL = CANTIDAD_ACTUAL + :cant, ULTIMO_MOVIMIENTO = SYSDATE WHERE ID_INVENTARIO = :id`,
                    { cant, id: idInv }, { autoCommit: false }
                );
                // Registrar movimiento de reversa (tipo REVERSION para anulación)
                await conn.execute(
                    `INSERT INTO MOVIMIENTOS_INVENTARIO (ID_INVENTARIO, ID_USUARIO, TIPO_MOVIMIENTO, CANTIDAD, MOTIVO, DOCUMENTO_REFERENCIA) 
                     VALUES (:id_inv, :usr, 'REVERSION', :cant, 'Reversa por anulación de factura', :doc)`,
                    { id_inv: idInv, usr: usuario, cant, doc: numFactura },
                    { autoCommit: false }
                );
            }
        }

        // Revertir cita a estado anterior si estaba vinculada
        await conn.execute(
            `UPDATE CITAS SET ESTADO = 'ATENDIDA', ID_FACTURA = NULL WHERE ID_FACTURA = :id`,
            [id], { autoCommit: false }
        );

        // Marcar factura como anulada
        await conn.execute("UPDATE FACTURAS SET ESTADO = 'ANULADA' WHERE ID_FACTURA = :id", [id], { autoCommit: false });
        await conn.commit();

        res.json({ message: 'Anulada. Inventario repuesto correctamente.' });
    } catch (e) {
        if (conn) await conn.rollback();
        console.error('Error anularFactura:', e);
        res.status(500).json({ error: e.message });
    } finally {
        if (conn) await conn.close();
    }
};

// 5. CITAS PENDIENTES (CORREGIDO ERROR 500)
exports.getCitasPendientes = async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        const id = req.params.id_paciente;
        
        // Query simplificada para evitar errores de ambigüedad
        const sql = `
            SELECT c.ID_CITA, TO_CHAR(c.FECHA_CITA, 'YYYY-MM-DD') AS FECHA_CITA, c.ESPECIALIDAD, c.COSTO_CONSULTA,
                   u.NOMBRES || ' ' || u.APELLIDO_PATERNO || ' ' || NVL(u.APELLIDO_MATERNO, '') AS MEDICO
            FROM CITAS c
            JOIN USUARIOS u ON c.ID_MEDICO = u.ID_USUARIO
            WHERE c.ID_PACIENTE = :id 
            AND UPPER(c.ESTADO) IN ('PROGRAMADA', 'CONFIRMADA', 'ATENDIDA')
            AND c.ID_FACTURA IS NULL
            ORDER BY c.FECHA_CITA DESC
        `;
        
        const result = await conn.execute(sql, [id], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        res.json({ citas: result.rows });
    } catch (e) {
        console.error("❌ Error Citas Pendientes:", e);
        res.status(500).json({ error: e.message });
    } finally {
        if(conn) await conn.close();
    }
};

// ==================================================================
// 6. GESTIÓN DE SESIONES DE CAJA
// ==================================================================

// Obtener sesión activa
exports.getSesionActiva = async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        const sql = `
            SELECT s.*, u.NOMBRES || ' ' || u.APELLIDO_PATERNO AS CAJERO
            FROM SESIONES_CAJA s
            JOIN USUARIOS u ON s.ID_USUARIO = u.ID_USUARIO
            WHERE s.ESTADO = 'ABIERTA'
            ORDER BY s.FECHA_APERTURA DESC
            FETCH NEXT 1 ROWS ONLY
        `;
        const result = await conn.execute(sql, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        if (result.rows.length === 0) {
            return res.json({ sesion: null, message: 'No hay sesión abierta' });
        }
        res.json({ sesion: result.rows[0] });
    } catch (e) {
        console.error("Error getSesionActiva:", e);
        res.status(500).json({ error: e.message });
    } finally {
        if (conn) await conn.close();
    }
};

// Abrir sesión de caja
exports.abrirSesionCaja = async (req, res) => {
    let conn;
    try {
        const { id_usuario, monto_inicial } = req.body;
        if (!id_usuario) return res.status(400).json({ error: 'Usuario requerido' });
        
        conn = await getConn();
        
        // Unicidad: verificar si ESTE usuario ya tiene una sesión abierta (ej. desde otra PC)
        const miSesion = await conn.execute(
            "SELECT ID_SESION FROM SESIONES_CAJA WHERE ESTADO = 'ABIERTA' AND ID_USUARIO = :uid",
            { uid: safeInt(id_usuario) }, { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (miSesion.rows.length > 0) {
            return res.status(400).json({ error: 'Ya tienes una sesión de caja abierta (posiblemente desde otra PC). Cierrala antes de abrir una nueva.' });
        }

        // Verificar si otro usuario tiene sesión abierta (solo una caja activa por sistema)
        const otraSesion = await conn.execute(
            "SELECT ID_SESION, ID_USUARIO FROM SESIONES_CAJA WHERE ESTADO = 'ABIERTA'",
            [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        if (otraSesion.rows.length > 0) {
            return res.status(400).json({ error: 'Ya hay una sesión de caja abierta por otro cajero. Espere a que cierre para abrir la suya.' });
        }
        
        const sql = `
            INSERT INTO SESIONES_CAJA (ID_USUARIO, MONTO_INICIAL, ESTADO, FECHA_APERTURA)
            VALUES (:id_usr, :monto, 'ABIERTA', SYSDATE)
            RETURNING ID_SESION INTO :id_out
        `;
        const result = await conn.execute(sql, {
            id_usr: safeInt(id_usuario),
            monto: safeFloat(monto_inicial || 0),
            id_out: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }, { autoCommit: true });
        
        res.status(201).json({ 
            message: 'Sesión abierta', 
            id_sesion: result.outBinds.id_out[0] 
        });
    } catch (e) {
        console.error("Error abrirSesionCaja:", e);
        res.status(500).json({ error: e.message });
    } finally {
        if (conn) await conn.close();
    }
};

// Cerrar sesión de caja (Corte Z)
exports.cerrarSesionCaja = async (req, res) => {
    let conn;
    try {
        const { id_sesion, monto_final } = req.body;
        const idSesion = req.params.id || id_sesion;
        
        if (!idSesion) return res.status(400).json({ error: 'ID de sesión requerido' });
        
        conn = await getConn();
        
        // Verificar que la sesión esté abierta
        const sesion = await conn.execute(
            `SELECT * FROM SESIONES_CAJA WHERE ID_SESION = :id`,
            [idSesion], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        if (sesion.rows.length === 0) {
            return res.status(404).json({ error: 'Sesión no encontrada' });
        }
        
        if (sesion.rows[0].ESTADO !== 'ABIERTA') {
            return res.status(400).json({ error: 'La sesión ya está cerrada' });
        }
        
        // Ventas por método de pago: facturas normales + pagos divididos (PAGOS_FACTURA)
        const mapMetodo = {};
        const ventasNormales = await conn.execute(
            `SELECT METODO_PAGO, NVL(SUM(TOTAL), 0) AS TOTAL FROM FACTURAS 
             WHERE ID_SESION = :id AND UPPER(ESTADO) = 'PAGADA' AND NUMERO_FACTURA NOT LIKE 'MOV-%' AND NVL(METODO_PAGO,'') != 'MIXTO'
             GROUP BY METODO_PAGO`,
            [idSesion], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        (ventasNormales.rows || []).forEach(r => { mapMetodo[r.METODO_PAGO] = safeFloat(r.TOTAL); });
        try {
            const ventasMixto = await conn.execute(
                `SELECT p.METODO_PAGO, NVL(SUM(p.MONTO), 0) AS TOTAL FROM PAGOS_FACTURA p 
                 JOIN FACTURAS f ON p.ID_FACTURA = f.ID_FACTURA 
                 WHERE f.ID_SESION = :id AND UPPER(f.ESTADO) = 'PAGADA' AND UPPER(NVL(f.METODO_PAGO,'')) = 'MIXTO'
                 GROUP BY p.METODO_PAGO`,
                [idSesion], { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            (ventasMixto.rows || []).forEach(r => {
                const k = r.METODO_PAGO;
                mapMetodo[k] = (mapMetodo[k] || 0) + safeFloat(r.TOTAL);
            });
        } catch (e) { /* PAGOS_FACTURA puede no existir */ }

        // Ingresos y egresos caja chica (MOV-INGRESO, MOV-EGRESO)
        const movCaja = await conn.execute(
            `SELECT NUMERO_FACTURA, NVL(TOTAL, 0) AS TOTAL FROM FACTURAS 
             WHERE ID_SESION = :id AND NUMERO_FACTURA LIKE 'MOV-%'`,
            [idSesion], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        let ingresosExtra = 0, egresosExtra = 0;
        (movCaja.rows || []).forEach(r => {
            const t = safeFloat(r.TOTAL);
            if (r.NUMERO_FACTURA && r.NUMERO_FACTURA.includes('INGRESO')) ingresosExtra += Math.abs(t);
            else if (r.NUMERO_FACTURA && r.NUMERO_FACTURA.includes('EGRESO')) egresosExtra += Math.abs(t);
        });

        const ventasEfectivo = mapMetodo['EFECTIVO'] || 0;
        const ventasQR = mapMetodo['QR'] || 0;
        const ventasTransferencia = mapMetodo['TRANSFERENCIA'] || 0;
        const ventasTarjeta = mapMetodo['TARJETA'] || 0;
        const totalVentas = ventasEfectivo + ventasQR + ventasTransferencia + ventasTarjeta;

        const montoInicial = safeFloat(sesion.rows[0].MONTO_INICIAL || 0);
        const montoTeoricoEfectivo = montoInicial + ventasEfectivo + ingresosExtra - egresosExtra;
        const montoFinal = safeFloat(monto_final);
        const diferenciaEfectivo = montoFinal - montoTeoricoEfectivo;

        // Actualizar sesión
        await conn.execute(
            `UPDATE SESIONES_CAJA SET ESTADO = 'CERRADA', FECHA_CIERRE = SYSDATE, MONTO_FINAL = :monto WHERE ID_SESION = :id`,
            { monto: montoFinal, id: safeInt(idSesion) },
            { autoCommit: true }
        );

        // Resumen por tipo de venta (citas vs productos)
        const resumenTipo = await conn.execute(
            `SELECT 
                NVL(SUM(CASE WHEN df.ID_CITA IS NOT NULL THEN df.SUBTOTAL ELSE 0 END), 0) AS VENTAS_CONSULTAS,
                NVL(SUM(CASE WHEN df.ID_PRODUCTO IS NOT NULL THEN df.SUBTOTAL ELSE 0 END), 0) AS VENTAS_INSUMOS
             FROM DETALLE_FACTURA df
             JOIN FACTURAS f ON df.ID_FACTURA = f.ID_FACTURA
             WHERE f.ID_SESION = :id AND UPPER(f.ESTADO) = 'PAGADA' AND f.NUMERO_FACTURA NOT LIKE 'MOV-%'`,
            [idSesion], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        const ventasConsultas = safeFloat(resumenTipo.rows[0]?.VENTAS_CONSULTAS || 0);
        const ventasInsumos = safeFloat(resumenTipo.rows[0]?.VENTAS_INSUMOS || 0);

        res.json({ 
            message: 'Sesión cerrada (Corte Z)',
            monto_inicial: montoInicial,
            total_facturado: totalVentas,
            monto_final: montoFinal,
            diferencia: diferenciaEfectivo,
            reporte_corte_z: {
                canales: [
                    { concepto: 'EFECTIVO (Caja)', esperado: montoTeoricoEfectivo, declarado: montoFinal, diferencia: diferenciaEfectivo },
                    { concepto: 'QR (Banco)', esperado: ventasQR, declarado: null, diferencia: null },
                    { concepto: 'Transferencia (Banco)', esperado: ventasTransferencia, declarado: null, diferencia: null },
                    { concepto: 'Tarjeta (Banco)', esperado: ventasTarjeta, declarado: null, diferencia: null }
                ],
                total_ventas: totalVentas,
                resumen_operaciones: [
                    { concepto: 'Ventas Consultas', monto: ventasConsultas },
                    { concepto: 'Ventas Insumos/Farmacia', monto: ventasInsumos },
                    { concepto: '(-) Egresos Caja Chica', monto: -egresosExtra },
                    { concepto: '(+) Ingresos Caja Chica', monto: ingresosExtra }
                ]
            }
        });
    } catch (e) {
        console.error("Error cerrarSesionCaja:", e);
        res.status(500).json({ error: e.message });
    } finally {
        if (conn) await conn.close();
    }
};

// ==================================================================
// 7. INGRESOS Y EGRESOS DE CAJA CHICA
// ==================================================================

// Registrar ingreso/egreso
exports.registrarMovimientoCaja = async (req, res) => {
    let conn;
    try {
        const { tipo, monto, concepto, id_sesion } = req.body;
        if (!tipo || !monto || !concepto) {
            return res.status(400).json({ error: 'Faltan datos requeridos (tipo, monto, concepto)' });
        }
        
        if (tipo.toUpperCase() !== 'INGRESO' && tipo.toUpperCase() !== 'EGRESO') {
            return res.status(400).json({ error: 'Tipo debe ser INGRESO o EGRESO' });
        }
        
        conn = await getConn();
        
        // Verificar que haya sesión activa
        let sesionId = id_sesion;
        if (!sesionId) {
            const sesionActiva = await conn.execute(
                "SELECT ID_SESION, ID_USUARIO FROM SESIONES_CAJA WHERE ESTADO = 'ABIERTA'",
                [], { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            if (sesionActiva.rows.length === 0) {
                return res.status(400).json({ error: 'No hay sesión de caja abierta. Debe abrir una sesión primero.' });
            }
            sesionId = sesionActiva.rows[0].ID_SESION;
        }
        
        const usuario = req.user?.id_usuario || req.body.id_usuario || 1;
        const montoNum = safeFloat(monto);
        const signo = tipo.toUpperCase() === 'INGRESO' ? 1 : -1;
        
        // Insertar movimiento como factura especial (para trazabilidad)
        const numMov = `MOV-${tipo.toUpperCase()}-${Date.now()}`;
        const sql = `
            INSERT INTO FACTURAS (
                NUMERO_FACTURA, ID_PACIENTE, ID_USUARIO_CAJERO, ID_SESION,
                FECHA_EMISION, SUBTOTAL, DESCUENTO, IVA, TOTAL, ESTADO, METODO_PAGO, NOTAS
            ) VALUES (
                :num_mov,
                1, -- Paciente genérico para movimientos de caja
                :id_usr,
                :id_ses,
                SYSDATE,
                :monto,
                0,
                0,
                :monto * :signo,
                'PAGADA',
                :tipo,
                :concepto
            )
        `;
        
        await conn.execute(sql, {
            num_mov: numMov,
            id_usr: usuario,
            id_ses: sesionId,
            monto: montoNum,
            signo: signo,
            tipo: tipo.toUpperCase(),
            concepto: concepto
        }, { autoCommit: true });
        
        res.status(201).json({ 
            message: `${tipo.toUpperCase()} registrado correctamente`,
            numero: numMov,
            monto: montoNum * signo
        });
    } catch (e) {
        console.error("Error registrarMovimientoCaja:", e);
        res.status(500).json({ error: e.message });
    } finally {
        if (conn) await conn.close();
    }
};

// ==================================================================
// 8. REPORTES POR MÉTODO DE PAGO
// ==================================================================

exports.getReporteIngresos = async (req, res) => {
    let conn;
    try {
        const { fecha_inicio, fecha_fin, id_sesion } = req.query;
        conn = await getConn();
        
        let whereClause = "UPPER(f.ESTADO) = 'PAGADA' AND f.NUMERO_FACTURA NOT LIKE 'MOV-%'";
        const binds = {};
        
        if (fecha_inicio) {
            whereClause += " AND TRUNC(f.FECHA_EMISION) >= TO_DATE(:fecha_ini, 'YYYY-MM-DD')";
            binds.fecha_ini = fecha_inicio;
        }
        if (fecha_fin) {
            whereClause += " AND TRUNC(f.FECHA_EMISION) <= TO_DATE(:fecha_fin, 'YYYY-MM-DD')";
            binds.fecha_fin = fecha_fin;
        }
        if (id_sesion) {
            whereClause += " AND f.ID_SESION = :id_ses";
            binds.id_ses = safeInt(id_sesion);
        }
        
        const sql = `
            SELECT 
                METODO_PAGO,
                COUNT(*) AS CANTIDAD,
                SUM(TOTAL) AS TOTAL_INGRESOS,
                MIN(FECHA_EMISION) AS PRIMERA_FACTURA,
                MAX(FECHA_EMISION) AS ULTIMA_FACTURA
            FROM FACTURAS f
            WHERE ${whereClause}
            GROUP BY METODO_PAGO
            ORDER BY TOTAL_INGRESOS DESC
        `;
        
        const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        
        // Calcular total general
        const totalGeneral = result.rows.reduce((sum, row) => sum + safeFloat(row.TOTAL_INGRESOS || 0), 0);
        
        res.json({ 
            reporte: result.rows,
            total_general: totalGeneral,
            periodo: {
                fecha_inicio: fecha_inicio || null,
                fecha_fin: fecha_fin || null
            }
        });
    } catch (e) {
        console.error("Error getReporteIngresos:", e);
        res.status(500).json({ error: e.message });
    } finally {
        if (conn) await conn.close();
    }
};

// ==================================================================
// 9. VALIDACIÓN DE ROLES (Middleware helper)
// ==================================================================

exports.validarRolCajero = async (req, res, next) => {
    try {
        // Obtener usuario del token (si está habilitado el auth)
        const userId = req.user?.id_usuario || 1; // Temporal: usar usuario por defecto
        
        const conn = await getConn();
        const user = await conn.execute(
            `SELECT u.*, r.NOMBRE_ROL FROM USUARIOS u
             JOIN ROLES r ON u.ID_ROL = r.ID_ROL
             WHERE u.ID_USUARIO = :id`,
            [userId], { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        await conn.close();
        
        if (user.rows.length === 0) {
            return res.status(401).json({ error: 'Usuario no encontrado' });
        }
        
        const rol = (user.rows[0].NOMBRE_ROL || '').toUpperCase();
        if (rol !== 'CAJERO' && rol !== 'ADMINISTRADOR' && rol !== 'ADMINISTRADOR SISTEMA') {
            return res.status(403).json({ error: 'No tiene permisos para operar en caja' });
        }
        
        req.userCajero = user.rows[0];
        next();
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

module.exports = exports;