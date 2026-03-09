#!/usr/bin/env node
/**
 * Script de prueba para verificar la conexión y datos de pacientes
 */

const oracledb = require('oracledb');

const dbConfig = {
    user: 'C##ELMARCHORE',
    password: '9012264',
    connectString: 'localhost:1521/XE'
};

async function testConnection() {
    let conn;
    try {
        console.log('🔄 Conectando a Oracle...');
        conn = await oracledb.getConnection(dbConfig);
        console.log('✅ Conexión exitosa\n');

        // Probar si tabla PACIENTES existe
        console.log('🔍 Buscando tabla PACIENTES...');
        const tableCheck = await conn.execute(`
            SELECT table_name FROM user_tables WHERE UPPER(table_name) = 'PACIENTES'
        `);
        
        if (tableCheck.rows && tableCheck.rows.length > 0) {
            console.log('✅ Tabla PACIENTES existe\n');

            // Contar registros
            console.log('📊 Contando registros en PACIENTES...');
            const countResult = await conn.execute(`SELECT COUNT(*) as total FROM PACIENTES`);
            const total = countResult.rows[0][0];
            console.log(`✅ Total de pacientes: ${total}\n`);

            // Listar primeros 5 pacientes
            if (total > 0) {
                console.log('📋 Primeros 5 pacientes:');
                const result = await conn.execute(
                    `SELECT ID_PACIENTE, NOMBRES, APELLIDOS, CI, ESTADO FROM PACIENTES FETCH FIRST 5 ROWS ONLY`,
                    [],
                    { outFormat: oracledb.OUT_FORMAT_OBJECT }
                );
                console.log(result.rows);
            } else {
                console.log('⚠️  No hay pacientes registrados en la base de datos');
                console.log('💡 Ejecuta: npm run init-db');
            }
        } else {
            console.log('❌ Tabla PACIENTES no existe');
            console.log('💡 Ejecuta: npm run init-db');
        }

    } catch (error) {
        console.error('❌ ERROR:', error.message);
        process.exit(1);
    } finally {
        if (conn) await conn.close();
    }
}

testConnection();
