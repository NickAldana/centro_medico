// backend/src/config/database.js
const oracledb = require('oracledb');

// =============================================================================
// 🚨 CORRECCIÓN CRÍTICA PARA CLOBs (TEXTOS LARGOS) 🚨
// Esto convierte automáticamente los campos CLOB (Dirección, Notas, etc.) a String.
// Sin esto, el frontend recibe [object Object].
// =============================================================================
oracledb.fetchAsString = [ oracledb.CLOB ];

// Configuración de conexión
const dbConfig = {
    user: process.env.DB_USER || 'C##ELMARCHORE',
    password: process.env.DB_PASSWORD || '9012264',
    connectString: process.env.DB_CONNECTION || 'localhost:1521/XE',
    poolMin: 2,
    poolMax: 10,
    poolIncrement: 1
};

// Inicializar el Pool de conexiones (Se llama al iniciar el servidor)
async function inicializarPool() {
    try {
        await oracledb.createPool(dbConfig);
        console.log('✅ Pool de conexiones Oracle inicializado correctamente');
    } catch (err) {
        console.error('❌ ERROR FATAL: No se pudo crear el pool de conexiones. Revisa credenciales y servicio DB.', err.message);
        throw err;
    }
}

// Función para obtener una conexión del pool con manejo de errores mejorado
async function getConnection() {
    let retries = 3;
    let delay = 1000;
    
    while (retries > 0) {
        try {
            const conn = await oracledb.getConnection();
            // Verificar que la conexión esté activa
            await conn.execute('SELECT 1 FROM DUAL');
            return conn;
        } catch (err) {
            retries--;
            if (err.errorNum === 1033 || err.code === 'ORA-01033') {
                // Oracle está iniciando/cerrando, esperar un poco
                if (retries > 0) {
                    console.warn(`⚠️ Oracle en proceso de inicio/cierre. Reintentando en ${delay}ms... (${retries} intentos restantes)`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2; // Backoff exponencial
                } else {
                    throw new Error('Oracle está en proceso de inicio o cierre. Por favor, espere unos segundos e intente nuevamente.');
                }
            } else {
                throw err;
            }
        }
    }
}

module.exports = {
    inicializarPool,
    getConnection,
    dbConfig
};