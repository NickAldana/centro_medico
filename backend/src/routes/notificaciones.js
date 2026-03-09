const express = require('express');
const router = express.Router();

const utils = require('../utils');

// =========================================================================
// 🔔 NOTIFICACIONES
// =========================================================================

// Obtener notificaciones NO leídas de un usuario
router.get('/:idUsuario', async (req, res) => {
    const { idUsuario } = req.params;

    try {
        const sql = `
            SELECT 
                id_notificacion,
                id_usuario_destino,
                titulo,
                mensaje,
                tipo,
                id_referencia,
                leida,
                fecha_creacion
            FROM notificaciones
            WHERE id_usuario_destino = :id
              AND leida = 0
            ORDER BY fecha_creacion DESC
        `;

        const data = await utils.selectAll(sql, { id: Number(idUsuario) });
        return res.json(data);
    } catch (err) {
        console.error('❌ Error obteniendo notificaciones:', err.message);
        return res.status(500).json({ error: 'Error al obtener notificaciones' });
    }
});

// Marcar una notificación como leída
router.put('/leida/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const sql = `
            UPDATE notificaciones 
            SET leida = 1
            WHERE id_notificacion = :id
        `;

        const result = await utils.execute(sql, { id: Number(id) }, { autoCommit: true });

        return res.json({ ok: true, rowsAffected: result.rowsAffected || 0 });
    } catch (err) {
        console.error('❌ Error marcando notificación como leída:', err.message);
        return res.status(500).json({ error: 'Error al actualizar notificación' });
    }
});

module.exports = router;

