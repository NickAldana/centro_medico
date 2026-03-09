// database/dbConfig.js
// CONFIGURACIÓN ORACLE - 100% FUNCIONAL CON TU .env ACTUAL

require('dotenv').config();

module.exports = {
    user: process.env.DB_USER || 'C##ELMARCHORE',
    password: process.env.DB_PASSWORD || '9012264',
    connectString: process.env.DB_CONNECTION_STRING || 'localhost:1521/XE',
    poolMin: parseInt(process.env.DB_POOL_MIN, 10) || 2,
    poolMax: parseInt(process.env.DB_POOL_MAX, 10) || 10,
    poolIncrement: parseInt(process.env.DB_POOL_INCREMENT, 10) || 1,
    poolTimeout: parseInt(process.env.DB_POOL_TIMEOUT, 10) || 60,
    queueTimeout: parseInt(process.env.DB_QUEUE_TIMEOUT, 10) || 60000
};