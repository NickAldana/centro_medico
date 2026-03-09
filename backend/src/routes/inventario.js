const express = require('express');
const { body, query } = require('express-validator');
const router = express.Router();
const inventarioController = require('../controllers/inventarioController');

// Validación
const validateProducto = [
    body('nombre_producto').trim().notEmpty().withMessage('Nombre requerido'),
    body('codigo_producto').trim().notEmpty().withMessage('Código requerido'),
    body('id_categoria').isInt({ min: 1 }).withMessage('Categoría requerida')
];

// --- RUTAS ---

// 1. Listar
router.get('/productos', inventarioController.getProductos);

// 2. Categorías (AQUÍ ESTABA EL ERROR PROBABLEMENTE)
router.get('/categorias', inventarioController.getCategorias);
router.post('/categorias', inventarioController.createCategoria);

// 3. Productos CRUD (Kardex debe ir antes de /:id)
router.post('/productos', validateProducto, inventarioController.createProducto);
router.get('/productos-por-vencer', inventarioController.getProductosPorVencer);
router.get('/productos/:id_producto/kardex', inventarioController.getKardex);
router.get('/productos/:id', inventarioController.getProductoById);
router.put('/productos/:id', validateProducto, inventarioController.updateProducto);
router.delete('/productos/:id', async (req, res) => {
    // Stub simple para soft delete
    res.json({message: 'Soft delete pendiente'}); 
});

// 4. Inventario / Lotes
router.post('/inventario', inventarioController.createInventario);
router.delete('/inventario/:id', inventarioController.deleteInventario);

// 5. Movimientos
router.post('/movimientos', inventarioController.registrarMovimiento);

module.exports = router;