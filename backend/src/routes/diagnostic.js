/**
 * RUTA DE DIAGNÓSTICO - Verificar datos de pacientes
 * GET /api/diagnostic/pacientes
 */

const express = require('express');
const router = express.Router();
const oracledb = require('oracledb');
const { getConnection } = require('../config/database');

router.get('/pacientes', async (req, res) => {
    let conn;
    try {
        console.log('🔍 Iniciando diagnóstico de pacientes...');
        
        conn = await getConnection();
        console.log('✅ Conexión a Oracle establecida');

        // Verificar que tabla existe
        const tableCheck = await conn.execute(`
            SELECT table_name FROM user_tables WHERE UPPER(table_name) = 'PACIENTES'
        `);
        
        if (!tableCheck.rows || tableCheck.rows.length === 0) {
            return res.json({
                status: 'error',
                message: 'Tabla PACIENTES no existe',
                hint: 'Ejecuta: npm run init-db'
            });
        }

        console.log('✅ Tabla PACIENTES existe');

        // Contar registros
        const countResult = await conn.execute(
            `SELECT COUNT(*) as total FROM PACIENTES`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );
        
        const total = countResult.rows[0].TOTAL;
        console.log(`✅ Total de pacientes: ${total}`);

        // Listar todos los pacientes
        const result = await conn.execute(
            `SELECT ID_PACIENTE, NOMBRES, APELLIDOS, CI, EMAIL, TELEFONO, CELULAR, ESTADO, FECHA_REGISTRO
             FROM PACIENTES 
             ORDER BY ID_PACIENTE`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const pacientes = result.rows || [];
        
        console.log(`✅ Se obtuvieron ${pacientes.length} registros`);

        res.json({
            status: 'success',
            total: total,
            pacientes: pacientes,
            columns: ['ID_PACIENTE', 'NOMBRES', 'APELLIDOS', 'CI', 'EMAIL', 'TELEFONO', 'CELULAR', 'ESTADO', 'FECHA_REGISTRO']
        });

    } catch (error) {
        console.error('❌ ERROR en diagnóstico:', error.message);
        res.status(500).json({
            status: 'error',
            message: error.message,
            hint: 'Verifica credenciales Oracle y conexión'
        });
    } finally {
        if (conn) await conn.close();
    }
});

module.exports = router;
