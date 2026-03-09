/**
 * CONTROLADOR DE INVENTARIO - VERSIÓN FINAL BLINDADA
 * Ubicación: backend/src/controllers/inventarioController.js
 */
const oracledb = require('oracledb');
const { validationResult } = require('express-validator');
const dbConfig = require('../config/database');

async function getConn() { return await dbConfig.getConnection(); }
function safeToString(v) { return (v === null || v === undefined) ? '' : String(v); }

// 1. LISTAR PRODUCTOS
const getProductos = async (req, res) => {
    let conn;
    try {
        res.setHeader('Cache-Control', 'no-store');
        conn = await getConn();
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        
        const { search, id_categoria, stock_bajo, estado } = req.query;
        const whereParts = [];
        const whereBinds = {};

        if (estado && estado.toLowerCase() !== 'todos') {
            whereParts.push("UPPER(p.ESTADO) = :estado");
            whereBinds.estado = (estado || 'ACTIVO').toUpperCase();
        } else {
            whereParts.push("UPPER(p.ESTADO) != 'ELIMINADO'");
        }

        if (id_categoria) {
            whereParts.push('p.ID_CATEGORIA = :idCategoria');
            whereBinds.idCategoria = parseInt(id_categoria);
        }

        if (search) {
            whereBinds.searchRaw = `%${search}%`;
            whereParts.push(`(UPPER(p.NOMBRE_PRODUCTO) LIKE UPPER(:searchRaw) OR UPPER(p.CODIGO_PRODUCTO) LIKE UPPER(:searchRaw))`);
        }

        if (stock_bajo === 'true') {
            whereParts.push(`NVL((SELECT SUM(i.CANTIDAD_ACTUAL) FROM INVENTARIO i WHERE i.ID_PRODUCTO = p.ID_PRODUCTO), 0) <= p.STOCK_MINIMO`);
        }

        const whereClause = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

        // Count
        const countQuery = `SELECT COUNT(*) AS TOTAL FROM PRODUCTOS p ${whereClause}`;
        const countRes = await conn.execute(countQuery, whereBinds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const total = countRes.rows?.[0]?.TOTAL || 0;

        // Data - Si es stock_bajo, incluir fecha de vencimiento
        const binds = { ...whereBinds, offset, limit };
        let query;
        
        if (stock_bajo === 'true') {
            // Para stock bajo, incluir fecha de vencimiento más próxima
            query = `
                SELECT p.ID_PRODUCTO, p.CODIGO_PRODUCTO, p.NOMBRE_PRODUCTO, p.DESCRIPCION,
                       p.ID_CATEGORIA, c.NOMBRE_CATEGORIA,
                       p.PRECIO_COMPRA, p.PRECIO_VENTA, p.STOCK_MINIMO, p.ESTADO, p.LABORATORIO,
                       NVL((SELECT SUM(i.CANTIDAD_ACTUAL) FROM INVENTARIO i WHERE i.ID_PRODUCTO = p.ID_PRODUCTO AND i.ESTADO != 'ELIMINADO'), 0) AS STOCK_ACTUAL,
                       (SELECT MIN(TO_CHAR(i.FECHA_VENCIMIENTO, 'YYYY-MM-DD')) FROM INVENTARIO i WHERE i.ID_PRODUCTO = p.ID_PRODUCTO AND i.ESTADO != 'ELIMINADO' AND i.FECHA_VENCIMIENTO IS NOT NULL) AS FECHA_VENCIMIENTO
                FROM PRODUCTOS p
                LEFT JOIN CATEGORIAS c ON p.ID_CATEGORIA = c.ID_CATEGORIA
                ${whereClause}
                ORDER BY p.NOMBRE_PRODUCTO ASC
                OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
            `;
        } else {
            query = `
                SELECT p.ID_PRODUCTO, p.CODIGO_PRODUCTO, p.NOMBRE_PRODUCTO, p.DESCRIPCION,
                       p.ID_CATEGORIA, c.NOMBRE_CATEGORIA,
                       p.PRECIO_COMPRA, p.PRECIO_VENTA, p.STOCK_MINIMO, p.ESTADO, p.LABORATORIO,
                       NVL((SELECT SUM(i.CANTIDAD_ACTUAL) FROM INVENTARIO i WHERE i.ID_PRODUCTO = p.ID_PRODUCTO), 0) AS STOCK_ACTUAL
                FROM PRODUCTOS p
                LEFT JOIN CATEGORIAS c ON p.ID_CATEGORIA = c.ID_CATEGORIA
                ${whereClause}
                ORDER BY p.NOMBRE_PRODUCTO ASC
                OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
            `;
        }

        const result = await conn.execute(query, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });

        const productos = (result.rows || []).map(r => {
            const producto = {
                id_producto: r.ID_PRODUCTO,
                codigo_producto: safeToString(r.CODIGO_PRODUCTO),
                nombre_producto: safeToString(r.NOMBRE_PRODUCTO),
                nombre_categoria: safeToString(r.NOMBRE_CATEGORIA),
                laboratorio: safeToString(r.LABORATORIO),
                precio_compra: r.PRECIO_COMPRA,
                precio_venta: r.PRECIO_VENTA,
                stock_minimo: r.STOCK_MINIMO,
                stock_actual: r.STOCK_ACTUAL,
                estado: safeToString(r.ESTADO).toLowerCase()
            };
            
            // Incluir fecha de vencimiento si está disponible
            if (r.FECHA_VENCIMIENTO) {
                producto.fecha_vencimiento = r.FECHA_VENCIMIENTO;
            }
            
            return producto;
        });

        res.json({ productos, pagination: { page, limit, total, totalPages: Math.ceil(total/limit) } });

    } catch (e) {
        console.error('❌ Error GET /productos:', e);
        res.status(500).json({ error: 'Error al listar productos' });
    } finally {
        if (conn) await conn.close();
    }
};

// 2. CREAR PRODUCTO (FIX ORA-01745)
const createProducto = async (req, res) => {
    let conn;
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

        conn = await getConn();
        const body = req.body;

        const check = await conn.execute("SELECT 1 FROM PRODUCTOS WHERE CODIGO_PRODUCTO = :cod", [body.codigo_producto]);
        if(check.rows.length > 0) return res.status(409).json({ error: 'El código ya existe' });

        // Nombres de variables seguros (:p_...)
        const sql = `
            INSERT INTO PRODUCTOS (
                CODIGO_PRODUCTO, NOMBRE_PRODUCTO, DESCRIPCION, ID_CATEGORIA, LABORATORIO,
                PRINCIPIO_ACTIVO, CONCENTRACION, PRESENTACION, UNIDAD_MEDIDA,
                STOCK_MINIMO, STOCK_MAXIMO, PRECIO_COMPRA, PRECIO_VENTA, REQUIERE_RECETA, ESTADO, CREADO_EN
            ) VALUES (
                :p_cod, :p_nom, :p_desc, :p_cat, :p_lab,
                :p_pa, :p_conc, :p_pres, :p_um,
                :p_min, :p_max, :p_compra, :p_venta, :p_receta, :p_estado, SYSDATE
            )
        `;

        await conn.execute(sql, {
            p_cod: body.codigo_producto,
            p_nom: body.nombre_producto,
            p_desc: body.descripcion || '',
            p_cat: parseInt(body.id_categoria),
            p_lab: body.laboratorio || '',
            p_pa: body.principio_activo || '',
            p_conc: body.concentracion || '',
            p_pres: body.presentacion || '',
            p_um: body.unidad_medida || 'unidades',
            p_min: parseInt(body.stock_minimo) || 10,
            p_max: parseInt(body.stock_maximo) || 1000,
            p_compra: parseFloat(body.precio_compra) || 0,
            p_venta: parseFloat(body.precio_venta) || 0,
            p_receta: body.requiere_receta ? 1 : 0,
            p_estado: (body.estado || 'ACTIVO').toUpperCase()
        }, { autoCommit: true });

        res.status(201).json({ message: 'Producto creado exitosamente' });

    } catch (e) {
        console.error('❌ Error crear producto:', e);
        res.status(500).json({ error: 'Error al crear producto: ' + e.message });
    } finally {
        if (conn) await conn.close();
    }
};

// 3. OBTENER POR ID (CON LOTES)
const getProductoById = async (req, res) => {
    let conn;
    try {
        res.setHeader('Cache-Control', 'no-store');
        conn = await getConn();
        const id = req.params.id;

        const result = await conn.execute(
            `SELECT * FROM PRODUCTOS WHERE ID_PRODUCTO = :id`, 
            [id], 
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (!result.rows.length) return res.status(404).json({ error: 'No encontrado' });
        
        const lotes = await conn.execute(
            `SELECT ID_INVENTARIO, LOTE, CANTIDAD_ACTUAL, TO_CHAR(FECHA_VENCIMIENTO, 'YYYY-MM-DD') as VENCE, UBICACION_ALMACEN, ESTADO 
             FROM INVENTARIO WHERE ID_PRODUCTO = :id AND ESTADO != 'ELIMINADO' ORDER BY FECHA_VENCIMIENTO ASC`,
            [id],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const p = result.rows[0];
        const producto = {};
        Object.keys(p).forEach(k => producto[k.toLowerCase()] = p[k]);
        
        producto.lotes = (lotes.rows || []).map(l => ({
            id_inventario: l.ID_INVENTARIO,
            lote: l.LOTE,
            cantidad: l.CANTIDAD_ACTUAL,
            vence: l.VENCE || '',
            ubicacion: l.UBICACION_ALMACEN,
            estado: l.ESTADO
        }));

        res.json(producto);

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Error al leer producto' });
    } finally {
        if (conn) await conn.close();
    }
};

// 4. ACTUALIZAR PRODUCTO
const updateProducto = async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        const id = parseInt(req.params.id);
        const body = req.body;

        const sql = `
            UPDATE PRODUCTOS SET
                CODIGO_PRODUCTO = :p_cod,
                NOMBRE_PRODUCTO = :p_nom,
                DESCRIPCION = :p_desc,
                ID_CATEGORIA = :p_cat,
                LABORATORIO = :p_lab,
                PRINCIPIO_ACTIVO = :p_pa,
                CONCENTRACION = :p_conc,
                PRESENTACION = :p_pres,
                UNIDAD_MEDIDA = :p_um,
                STOCK_MINIMO = :p_min,
                STOCK_MAXIMO = :p_max,
                PRECIO_COMPRA = :p_compra,
                PRECIO_VENTA = :p_venta,
                REQUIERE_RECETA = :p_receta,
                ESTADO = :p_estado
            WHERE ID_PRODUCTO = :p_id
        `;

        await conn.execute(sql, {
            p_cod: body.codigo_producto,
            p_nom: body.nombre_producto,
            p_desc: body.descripcion || '',
            p_cat: parseInt(body.id_categoria),
            p_lab: body.laboratorio || '',
            p_pa: body.principio_activo || '',
            p_conc: body.concentracion || '',
            p_pres: body.presentacion || '',
            p_um: body.unidad_medida || 'unidades',
            p_min: parseInt(body.stock_minimo) || 0,
            p_max: parseInt(body.stock_maximo) || 0,
            p_compra: parseFloat(body.precio_compra) || 0,
            p_venta: parseFloat(body.precio_venta) || 0,
            p_receta: body.requiere_receta ? 1 : 0,
            p_estado: (body.estado || 'ACTIVO').toUpperCase(),
            p_id: id
        }, { autoCommit: true });

        res.json({ message: 'Producto actualizado exitosamente' });

    } catch (e) {
        console.error('❌ Error updateProducto:', e);
        res.status(500).json({ error: 'Error al actualizar producto' });
    } finally {
        if (conn) await conn.close();
    }
};

// 5. CATEGORIAS
const getCategorias = async (req, res) => {
    let conn;
    try {
        res.setHeader('Cache-Control', 'no-store');
        conn = await getConn();
        const result = await conn.execute(
            "SELECT * FROM CATEGORIAS WHERE UPPER(ESTADO) = 'ACTIVO' ORDER BY NOMBRE_CATEGORIA",
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        res.json({ categorias: result.rows });
    } catch(e) {
        res.status(500).json({ error: 'Error al cargar categorías' });
    } finally {
        if(conn) await conn.close();
    }
};

const createCategoria = async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        const { nombre_categoria, descripcion } = req.body;
        await conn.execute(
            "INSERT INTO CATEGORIAS (NOMBRE_CATEGORIA, DESCRIPCION, ESTADO, CREADO_EN) VALUES (:nom, :desc, 'ACTIVO', SYSDATE)",
            { nom: nombre_categoria, desc: descripcion || '' },
            { autoCommit: true }
        );
        res.json({ message: 'Categoría creada' });
    } catch (e) {
        res.status(500).json({ error: 'Error al crear categoría' });
    } finally {
        if(conn) await conn.close();
    }
};

// 6. GESTIÓN DE LOTES (FIX ORA-01745)
const createInventario = async (req, res) => {
    let conn;
    try {
        const id_producto = parseInt(req.body.id_producto);
        const cantidad_actual = parseInt(req.body.cantidad_actual);
        const costo_unitario = parseFloat(req.body.costo_unitario);
        const lote = req.body.lote ? String(req.body.lote).toUpperCase() : 'S/L';
        const fecha_vencimiento = req.body.fecha_vencimiento;
        const ubicacion_almacen = req.body.ubicacion_almacen || 'GENERAL';

        if (isNaN(id_producto) || isNaN(cantidad_actual) || isNaN(costo_unitario)) {
            return res.status(400).json({ error: 'Datos numéricos inválidos' });
        }

        conn = await getConn();
        const usuario = 1; // ID Admin por defecto

        const check = await conn.execute(
            "SELECT 1 FROM INVENTARIO WHERE ID_PRODUCTO = :id AND LOTE = :lote AND ESTADO != 'ELIMINADO'",
            { id: id_producto, lote: lote }
        );
        if (check.rows.length > 0) return res.status(409).json({ error: 'Este lote ya existe' });

        const sqlLote = `
            INSERT INTO INVENTARIO (
                ID_PRODUCTO, LOTE, FECHA_VENCIMIENTO, CANTIDAD_ACTUAL, 
                UBICACION_ALMACEN, COSTO_UNITARIO, ESTADO, CREADO_EN
            ) VALUES (
                :p_id, :p_lote, TO_DATE(:p_vence, 'YYYY-MM-DD'), :p_cant, 
                :p_ubi, :p_costo, 'DISPONIBLE', SYSDATE
            ) RETURNING ID_INVENTARIO INTO :id_out
        `;

        const resLote = await conn.execute(sqlLote, {
            p_id: id_producto,
            p_lote: lote,
            p_vence: fecha_vencimiento,
            p_cant: cantidad_actual,
            p_ubi: ubicacion_almacen,
            p_costo: costo_unitario,
            id_out: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
        }, { autoCommit: false });

        const idInventario = resLote.outBinds.id_out[0];

        const sqlMov = `
            INSERT INTO MOVIMIENTOS_INVENTARIO (
                ID_INVENTARIO, ID_USUARIO, TIPO_MOVIMIENTO, CANTIDAD, 
                MOTIVO, FECHA_MOVIMIENTO, COSTO_UNITARIO
            ) VALUES (
                :p_inv, :p_usr, 'ENTRADA', :p_cant, 
                'Carga Inicial', SYSDATE, :p_costo
            )
        `;

        await conn.execute(sqlMov, {
            p_inv: idInventario,
            p_usr: usuario,
            p_cant: cantidad_actual,
            p_costo: costo_unitario
        }, { autoCommit: true });

        res.status(201).json({ message: 'Lote agregado correctamente', id: idInventario });

    } catch (e) {
        if (conn) await conn.rollback();
        console.error('❌ Error createInventario:', e);
        res.status(500).json({ error: 'Error al crear lote: ' + e.message });
    } finally {
        if (conn) await conn.close();
    }
};

const deleteInventario = async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        const id = req.params.id;
        await conn.execute("UPDATE INVENTARIO SET ESTADO = 'ELIMINADO' WHERE ID_INVENTARIO = :id", {id}, {autoCommit:true});
        res.json({ message: 'Lote eliminado' });
    } catch(e) {
        res.status(500).json({ error: e.message });
    } finally {
        if(conn) await conn.close();
    }
};

// 7. REGISTRAR MOVIMIENTO
const registrarMovimiento = async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        const { id_inventario, tipo_movimiento, cantidad, motivo, costo_unitario, documento_referencia } = req.body;
        const usuario = 1; // Default Admin

        const invRes = await conn.execute(
            "SELECT CANTIDAD_ACTUAL FROM INVENTARIO WHERE ID_INVENTARIO = :id",
            [id_inventario],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        if(!invRes.rows.length) return res.status(404).json({ error: 'Lote no encontrado' });
        
        const currentStock = invRes.rows[0].CANTIDAD_ACTUAL;
        const cant = parseInt(cantidad);
        let newStock = currentStock;

        const tipo = tipo_movimiento.toUpperCase();
        if(['SALIDA', 'DAÑO', 'AJUSTE_NEG'].includes(tipo)) {
            if(currentStock < cant) return res.status(400).json({ error: 'Stock insuficiente' });
            newStock -= cant;
        } else {
            newStock += cant;
        }

        await conn.execute(`
            INSERT INTO MOVIMIENTOS_INVENTARIO (ID_INVENTARIO, ID_USUARIO, TIPO_MOVIMIENTO, CANTIDAD, MOTIVO, DOCUMENTO_REFERENCIA, COSTO_UNITARIO, FECHA_MOVIMIENTO)
            VALUES (:inv, :usr, :tipo, :cant, :mot, :doc, :costo, SYSDATE)
        `, {
            inv: id_inventario,
            usr: usuario,
            tipo: tipo,
            cant: cant,
            mot: motivo || '',
            doc: documento_referencia || '',
            costo: costo_unitario || 0
        }, { autoCommit: false });

        await conn.execute(
            `UPDATE INVENTARIO SET CANTIDAD_ACTUAL = :cant, ULTIMO_MOVIMIENTO = SYSDATE WHERE ID_INVENTARIO = :id`,
            { cant: newStock, id: id_inventario },
            { autoCommit: true }
        );

        res.json({ message: 'Movimiento registrado', nuevo_stock: newStock });

    } catch (e) {
        if(conn) await conn.rollback();
        console.error('❌ Error movimiento:', e);
        res.status(500).json({ error: 'Error al registrar movimiento' });
    } finally {
        if (conn) await conn.close();
    }
};

// HU004: Kardex - Historial de movimientos de entrada y salida por producto
const getKardex = async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        const id_producto = parseInt(req.params.id_producto);
        if (isNaN(id_producto)) return res.status(400).json({ error: 'ID producto inválido' });

        const sql = `
            SELECT m.ID_MOVIMIENTO, m.TIPO_MOVIMIENTO, m.CANTIDAD, m.MOTIVO, m.COSTO_UNITARIO,
                   TO_CHAR(m.FECHA_MOVIMIENTO, 'YYYY-MM-DD HH24:MI') AS FECHA,
                   i.LOTE, TO_CHAR(i.FECHA_VENCIMIENTO, 'YYYY-MM-DD') AS FECHA_VENCIMIENTO,
                   i.CANTIDAD_ACTUAL
            FROM MOVIMIENTOS_INVENTARIO m
            JOIN INVENTARIO i ON m.ID_INVENTARIO = i.ID_INVENTARIO
            WHERE i.ID_PRODUCTO = :id_prod AND i.ESTADO != 'ELIMINADO'
            ORDER BY m.FECHA_MOVIMIENTO DESC
        `;
        const result = await conn.execute(sql, { id_prod: id_producto }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const movimientos = (result.rows || []).map(r => ({
            id_movimiento: r.ID_MOVIMIENTO,
            tipo: r.TIPO_MOVIMIENTO,
            cantidad: r.CANTIDAD,
            motivo: safeToString(r.MOTIVO),
            costo_unitario: r.COSTO_UNITARIO,
            fecha: r.FECHA,
            lote: safeToString(r.LOTE),
            fecha_vencimiento: r.FECHA_VENCIMIENTO,
            cantidad_actual: r.CANTIDAD_ACTUAL
        }));
        res.json({ kardex: movimientos });
    } catch (e) {
        console.error('Error getKardex:', e);
        res.status(500).json({ error: 'Error al obtener Kardex' });
    } finally {
        if (conn) await conn.close();
    }
};

// HU004: Productos próximos a vencer (30 días)
const getProductosPorVencer = async (req, res) => {
    let conn;
    try {
        conn = await getConn();
        const dias = parseInt(req.query.dias) || 30;
        const sql = `
            SELECT p.ID_PRODUCTO, p.NOMBRE_PRODUCTO, p.CODIGO_PRODUCTO, i.LOTE,
                   i.CANTIDAD_ACTUAL, TO_CHAR(i.FECHA_VENCIMIENTO, 'YYYY-MM-DD') AS FECHA_VENCIMIENTO,
                   TRUNC(i.FECHA_VENCIMIENTO - SYSDATE) AS DIAS_RESTANTES
            FROM INVENTARIO i
            JOIN PRODUCTOS p ON i.ID_PRODUCTO = p.ID_PRODUCTO
            WHERE i.ESTADO != 'ELIMINADO' AND i.FECHA_VENCIMIENTO IS NOT NULL
              AND i.FECHA_VENCIMIENTO BETWEEN SYSDATE AND SYSDATE + :dias
            ORDER BY i.FECHA_VENCIMIENTO ASC
        `;
        const result = await conn.execute(sql, [dias], { outFormat: oracledb.OUT_FORMAT_OBJECT });
        const lista = (result.rows || []).map(r => ({
            id_producto: r.ID_PRODUCTO,
            nombre_producto: safeToString(r.NOMBRE_PRODUCTO),
            codigo: safeToString(r.CODIGO_PRODUCTO),
            lote: safeToString(r.LOTE),
            cantidad: r.CANTIDAD_ACTUAL,
            fecha_vencimiento: r.FECHA_VENCIMIENTO,
            dias_restantes: r.DIAS_RESTANTES
        }));
        res.json({ productos: lista });
    } catch (e) {
        console.error('Error productos por vencer:', e);
        res.status(500).json({ error: 'Error al listar' });
    } finally {
        if (conn) await conn.close();
    }
};

module.exports = {
    getProductos,
    createProducto,
    getProductoById,
    updateProducto,
    getCategorias,
    createCategoria,
    createInventario,
    deleteInventario,
    registrarMovimiento,
    getKardex,
    getProductosPorVencer
};