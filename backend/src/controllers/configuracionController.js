/**
 * CONTROLADOR DE CONFIGURACIÓN - VERSIÓN SENIOR V3
 * (Resolución del Bug Silencioso de Oracle OUT_FORMAT_OBJECT)
 */
const fs = require('fs');
const path = require('path');
const oracledb = require('oracledb'); 
const { selectOne, selectAll, formatearTimestamp } = require('../utils'); 
const database = require('../utils'); 

const controller = {};

// Helper para sanear strings (evita que se guarde la palabra "undefined" en la BD)
const safeStr = (v) => (v !== undefined && v !== null && v !== 'undefined') ? String(v).trim() : '';

// 1. OBTENER CONFIGURACIÓN
controller.getConfiguracionSistema = async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        
        const query = `SELECT * FROM (SELECT * FROM CONFIGURACION_SISTEMA ORDER BY ID_CONFIGURACION DESC) WHERE ROWNUM = 1`;
        const config = await selectOne(query);

        if (!config) {
            return res.json({
                nombre_empresa: 'Centro Médico Default',
                nit: '0',
                iva_porcentaje: 13,
                tiempo_inactividad: 30
            });
        }

        // Oracle puede devolver NUMBER como OracleNumber; convertir explícitamente
        const tiempoInactividad = Number(config.TIEMPO_INACTIVIDAD ?? config.tiempo_inactividad ?? 30) || 30;
        const ivaPorcentaje = Number(config.IVA_PORCENTAJE ?? config.iva_porcentaje ?? 13) || 13;

        res.json({
            id_configuracion: config.ID_CONFIGURACION ?? config.id_configuracion,
            nombre_empresa: safeStr(config.NOMBRE_EMPRESA ?? config.nombre_empresa),
            nit: safeStr(config.NIT ?? config.nit),
            direccion: safeStr(config.DIRECCION ?? config.direccion),
            telefono: safeStr(config.TELEFONO ?? config.telefono),
            email: safeStr(config.EMAIL ?? config.email),
            horario_atencion: safeStr(config.HORARIO_ATENCION ?? config.horario_atencion),
            iva_porcentaje: ivaPorcentaje,
            tiempo_inactividad: tiempoInactividad,
            logo_url: safeStr(config.LOGO_URL ?? config.logo_url)
        });
    } catch (error) { 
        console.error(error);
        res.status(500).json({ error: error.message }); 
    }
};

// 2. ACTUALIZAR CONFIGURACIÓN (BLINDADO)
controller.updateConfiguracionSistema = async (req, res) => {
    let conn;
    try {
        const { 
            nombre_empresa, nit, direccion, telefono, email, 
            horario_atencion, iva_porcentaje, tiempo_inactividad, logo_url
        } = req.body;

        // HU007 Criterio 4: Validar que los campos obligatorios no queden vacíos
        if (!nombre_empresa || !String(nombre_empresa).trim()) {
            return res.status(400).json({ error: 'El nombre del centro es obligatorio' });
        }
        if (!nit || !String(nit).trim()) {
            return res.status(400).json({ error: 'El NIT es obligatorio' });
        }

        const tiempoFinal = parseInt(tiempo_inactividad) || 30;
        const ivaFinal = parseFloat(iva_porcentaje) || 13;

        conn = await database.getConnection();

        // Verificar si existe registro (ROWNUM para compatibilidad con Oracle 11g XE)
        const check = await conn.execute(
            `SELECT ID_CONFIGURACION FROM (SELECT ID_CONFIGURACION FROM CONFIGURACION_SISTEMA ORDER BY ID_CONFIGURACION DESC) WHERE ROWNUM = 1`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (check.rows && check.rows.length > 0) {
            const row = check.rows[0];
            // Obtenemos el ID (Oracle puede devolver OracleNumber, convertir explícitamente)
            const idConfig = Number(row.ID_CONFIGURACION ?? row.id_configuracion ?? 0);
            
            if (!idConfig || isNaN(idConfig)) {
                throw new Error("No se detectó un ID válido en la base de datos.");
            }

            const sql = `
                UPDATE CONFIGURACION_SISTEMA SET
                    NOMBRE_EMPRESA = :nm,
                    NIT = :nit,
                    DIRECCION = :dir,
                    TELEFONO = :tel,
                    EMAIL = :em,
                    HORARIO_ATENCION = :hor,
                    IVA_PORCENTAJE = :iva,
                    TIEMPO_INACTIVIDAD = :tpo,
                    LOGO_URL = :logo,
                    ACTUALIZADO_EN = SYSDATE
                WHERE ID_CONFIGURACION = :id
            `;
            
            const binds = {
                nm: safeStr(nombre_empresa),
                nit: safeStr(nit),
                dir: safeStr(direccion),
                tel: safeStr(telefono),
                em: safeStr(email),
                hor: safeStr(horario_atencion),
                iva: ivaFinal,
                tpo: tiempoFinal, 
                logo: logo_url || null,
                id: idConfig
            };
            
            const result = await conn.execute(sql, binds, { autoCommit: true });
            
            if (result.rowsAffected === 0) {
                throw new Error("No se actualizó ningún registro. Verifique que la configuración exista en la base de datos.");
            }
            console.log(`✅ EXITO: Oracle actualizó ${result.rowsAffected} fila(s). Nuevo tiempo_inactividad: ${tiempoFinal}`);
        } else {
            // Si la tabla estuviera vacía, creamos el primer registro
            const sql = `
                INSERT INTO CONFIGURACION_SISTEMA (
                    NOMBRE_EMPRESA, NIT, DIRECCION, TELEFONO, EMAIL, 
                    HORARIO_ATENCION, IVA_PORCENTAJE, TIEMPO_INACTIVIDAD, LOGO_URL, CREADO_EN
                ) VALUES (
                    :nm, :nit, :dir, :tel, :em, :hor, :iva, :tpo, :logo, SYSDATE
                )
            `;
            
            const result = await conn.execute(sql, {
                nm: safeStr(nombre_empresa),
                nit: safeStr(nit),
                dir: safeStr(direccion),
                tel: safeStr(telefono),
                em: safeStr(email),
                hor: safeStr(horario_atencion),
                iva: ivaFinal,
                tpo: tiempoFinal,
                logo: logo_url || null
            }, { autoCommit: true });
            
            console.log(`✅ EXITO: Configuración insertada. Filas afectadas: ${result.rowsAffected}`);
        }

        res.json({ message: 'Configuración guardada correctamente', tiempo_inactividad: tiempoFinal });

    } catch (error) {
        console.error("❌ Error CRÍTICO al guardar config:", error);
        res.status(500).json({ error: error.message });
    } finally {
        if (conn) await conn.close();
    }
};

// ============================================================================
// OTRAS FUNCIONES MANTENIDAS INTACTAS (Roles, Logs, Backup)
// ============================================================================

controller.getRoles = async (req, res) => { 
    try { res.json({roles: await selectAll("SELECT * FROM ROLES ORDER BY ID_ROL ASC")}); } 
    catch(e) { res.status(500).json({error:e.message}); } 
};

controller.getPermisos = async (req, res) => { 
    try { res.json({permisos: await selectAll("SELECT * FROM PERMISOS ORDER BY MODULO")}); } 
    catch(e) { res.status(500).json({error:e.message}); } 
};

controller.getPermisosPorRol = async (req, res) => { 
    try {
        const p = await selectAll(
            `SELECT p.ID_PERMISO, p.NOMBRE_PERMISO, p.MODULO, 
             CASE WHEN rp.ID_ROL IS NOT NULL THEN 1 ELSE 0 END AS TIENE_PERMISO 
             FROM PERMISOS p 
             LEFT JOIN ROL_PERMISOS rp ON p.ID_PERMISO = rp.ID_PERMISO AND rp.ID_ROL = :id 
             ORDER BY p.MODULO`, [req.params.id]
        ); 
        res.json({permisos: p});
    } catch(e) { res.status(500).json({error:e.message}); } 
};

controller.guardarPermisosRol = async (req, res) => { 
    let c; 
    try {
        c = await database.getConnection(); 
        await c.execute("DELETE FROM ROL_PERMISOS WHERE ID_ROL=:id", [req.params.id], {autoCommit:false});
        if(req.body.permisos) {
            for(let p of req.body.permisos) {
                await c.execute("INSERT INTO ROL_PERMISOS VALUES(seq_rol_permiso.nextval, :r, :p, SYSDATE)", [req.params.id, p], {autoCommit:false});
            }
        }
        await c.commit(); 
        res.json({message:"OK"});
    } catch(e) {
        if(c) await c.rollback();
        res.status(500).json({error:e.message});
    } finally {
        if(c) await c.close();
    } 
};

controller.getLogs = async (req, res) => { 
    try {
        const {search, fecha} = req.query; 
        let sql = `SELECT * FROM (SELECT a.*, ROWNUM rnum FROM (SELECT b.FECHA_REGISTRO, u.NOMBRE_USUARIO, b.ACCION, b.MODULO, b.DESCRIPCION FROM BITACORA_ACCESOS b LEFT JOIN USUARIOS u ON b.ID_USUARIO = u.ID_USUARIO ORDER BY b.FECHA_REGISTRO DESC) a WHERE ROWNUM <= 20) WHERE rnum > 0`;
        res.json({logs: await selectAll(sql), pagination:{total:0}});
    } catch(e){ res.status(500).json({error:e.message}); } 
};

controller.createBackup = async (req, res) => {
    let conn;
    try {
        conn = await database.getConnection();
        const tables = ['ROLES','PERMISOS','ROL_PERMISOS','CONFIGURACION_SISTEMA','USUARIOS','PACIENTES','CATEGORIAS','PRODUCTOS','INVENTARIO','SESIONES_CAJA','FACTURAS','DETALLE_FACTURA','CITAS','BITACORA_ACCESOS'];
        let sqlDump = `-- BACKUP ${new Date().toISOString()}\n`;
        
        for (const table of tables) {
            try {
                const check = await conn.execute(`SELECT COUNT(*) FROM user_tables WHERE table_name = :t`, [table]);
                if(check.rows[0][0] > 0 || check.rows[0].COUNT > 0 || check.rows[0]['COUNT(*)'] > 0) {
                    const result = await conn.execute(`SELECT * FROM ${table}`, [], { outFormat: oracledb.OUT_FORMAT_OBJECT });
                    result.rows.forEach(row => {
                        const cols = Object.keys(row).join(', ');
                        const vals = Object.values(row).map(v => v === null ? 'NULL' : (typeof v === 'string' || v instanceof Date ? `'${String(v).replace(/'/g, "''")}'` : v)).join(', ');
                        sqlDump += `INSERT INTO ${table} (${cols}) VALUES (${vals});\n`;
                    });
                }
            } catch(err) { console.warn(`Error en tabla ${table}:`, err.message); }
        }
        
        const fileName = `backup_${Date.now()}.sql`;
        const pDir = path.join(__dirname, '../../../public/backups'); 
        if (!fs.existsSync(pDir)) fs.mkdirSync(pDir, { recursive: true });
        fs.writeFileSync(path.join(pDir, fileName), sqlDump);
        res.json({ message: 'Backup creado', file_url: `/backups/${fileName}` });
    } catch (e) { res.status(500).json({ error: e.message }); } 
    finally { if(conn) await conn.close(); }
};

module.exports = controller;