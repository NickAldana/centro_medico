// backend/src/index.js
// PUNTO DE ENTRADA PRINCIPAL

require('dotenv').config();
const app = require('./app');

// =========================================================================
// CORRECCIÓN IMPORTANTE:
// Importamos desde './utils' porque ahí definimos la función 'inicializarPool'
// robusta que maneja la conexión a Oracle correctamente.
// =========================================================================
const db = require('./utils'); 

const PORT = process.env.PORT || 3000;

(async () => {
    try {
        console.log('⏳ Iniciando servicios del sistema...');

        // 1. Inicializamos el Pool de Base de Datos
        // Esto crea las conexiones listas para ser usadas por los controladores
        await db.inicializarPool();

        // 2. Levantamos el servidor Express
        app.listen(PORT, () => {
            console.log(`
╔══════════════════════════════════════════════════════════════╗
║            SISTEMA MÉDICO GESTION ADMINISTRATIVA             ║
╠══════════════════════════════════════════════════════════════╣
║  Estado:  ONLINE 🟢                                          ║
║  Puerto:  ${PORT}                                               ║
║  Acceso:  http://localhost:${PORT}                              ║
╚══════════════════════════════════════════════════════════════╝
            `);
        });

    } catch (err) {
        console.error('\n🛑 ERROR FATAL AL INICIAR EL SISTEMA:');
        console.error(err.message);
        console.error('Verifique que la base de datos Oracle esté corriendo y las credenciales sean correctas.');
        process.exit(1);
    }
})();