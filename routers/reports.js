const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');
const router = express.Router();

router.post('/', verifyToken, async (req, res) => {
    const { ID_Post, ID_Comentario, reason, descripcion } = req.body;
    if ((!ID_Post && !ID_Comentario) || (ID_Post && ID_Comentario)) {
        return res.status(400).json({ error: 'Debes reportar un POST o un COMENTARIO, no ambos' });
    }
    const validReasons = ['spam', 'fake_information', 'harassment', 'inappropriate_content', 'scam', 'impersonation'];
    if (!validReasons.includes(reason)) {
        return res.status(400).json({ error: 'Razón inválida' });
    }
    try {
        await db.execute(
            `INSERT INTO T_Reportes (ID_Usuario, ID_Post, ID_Comentario, reason, descripcion)
             VALUES (?, ?, ?, ?, ?)`,
            [req.userId, ID_Post || null, ID_Comentario || null, reason, descripcion || null]
        );
        res.status(201).json({ message: 'Reporte enviado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al reportar' });
    }
});

// (Opcional) Obtener mis reportes
router.get('/mis-reportes', verifyToken, async (req, res) => {
    try {
        const [reportes] = await db.execute(
            'SELECT * FROM T_Reportes WHERE ID_Usuario = ? ORDER BY created_at DESC',
            [req.userId]
        );
        res.json(reportes);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

module.exports = router;