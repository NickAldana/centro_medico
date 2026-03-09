/**
 * UTILS/INDEX.JS - NÚCLEO HÍBRIDO (ROBUSTO)
 * Combina la compatibilidad Legacy con las nuevas funciones optimizadas.
 */

const oracledb = require('oracledb');
const db = require('../config/database'); // Importamos la configuración maestra

// =====================================================================
// 1. CONFIGURACIÓN GLOBAL DE ORACLE
// =====================================================================
// Esto evita que los textos largos (CLOB) lleguen como objetos raros al frontend
oracledb.fetchAsString = [ oracledb.CLOB ];
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

// =====================================================================
// 2. HELPER: TRADUCTOR DE DATOS (Vital para el Frontend)
// =====================================================================
const mapKeysToLower = (row) => {
    if (!row) return null;
    const newRow = {};
    
    Object.keys(row).forEach(key => {
        const lowerKey = key.toLowerCase();
        let value = row[key];

        // Manejo inteligente de fechas
        if (value instanceof Date) {
            try {
                // Ajuste para la zona horaria de Bolivia (UTC-4) para evitar desfases
                value.setHours(value.getHours() - 4); 
                const iso = value.toISOString();
                
                if (key.includes('FECHA') && !key.includes('HORA') && !key.includes('CREADO')) {
                    newRow[lowerKey] = iso.split('T')[0];
                } else {
                    newRow[lowerKey] = iso; 
                }
            } catch (e) {
                newRow[lowerKey] = null;
            }
        } else {
            newRow[lowerKey] = value;
        }
        
        // Mantenemos la llave original también intacta para compatibilidad
        newRow[key] = value; 
    });
    
    return newRow;
};

// =====================================================================
// 3. EXPORTACIÓN DE FUNCIONES (La "Navaja Suiza")
// =====================================================================
module.exports = {
    // A) Para que index.js arranque el servidor sin errores
    inicializarPool: db.inicializarPool,

    // B) Para módulos LEGACY (Dashboard, Citas, Auth) que piden conexión manual
    getConnection: db.getConnection,

    // C) Para módulos LEGACY que usan utils.execute() directo
    execute: async (sql, binds = {}, opts = { autoCommit: true }) => {
        let conn;
        try {
            conn = await db.getConnection();
            const result = await conn.execute(sql, binds, opts);
            return result;
        } catch (err) {
            console.error("❌ Error Utils.execute (Legacy):", err.message);
            throw err;
        } finally {
            if (conn) { try { await conn.close(); } catch (e) {} }
        }
    },

    // D) Para módulos NUEVOS (Usuarios, Pacientes) - Devuelve JSON limpio
    selectAll: async (sql, binds = {}) => {
        let conn;
        try {
            conn = await db.getConnection();
            const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            // Aplicamos el traductor a cada fila
            return (result.rows || []).map(mapKeysToLower);
        } catch (err) {
            console.error("❌ Error Utils.selectAll:", err.message);
            throw err;
        } finally {
            if (conn) { try { await conn.close(); } catch (e) {} }
        }
    },

    // E) Para módulos NUEVOS - Devuelve un solo objeto limpio
    selectOne: async (sql, binds = {}) => {
        let conn;
        try {
            conn = await db.getConnection();
            const result = await conn.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            if (!result.rows || result.rows.length === 0) return null;
            return mapKeysToLower(result.rows[0]);
        } catch (err) {
            console.error("❌ Error Utils.selectOne:", err.message);
            throw err;
        } finally {
            if (conn) { try { await conn.close(); } catch (e) {} }
        }
    }
};