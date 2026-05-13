const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');
const router = express.Router();

// Dar/quitar like a un post
router.post('/posts/:id/like', verifyToken, async (req, res) => {
    const postId = req.params.id;
    try {
        // Verificar si ya existe like
        const [exists] = await db.execute(
            'SELECT * FROM T_Postlikes WHERE ID_Usuario = ? AND ID_Post = ?',
            [req.userId, postId]
        );
        if (exists.length) {
            // Quitar like
            await db.execute('DELETE FROM T_Postlikes WHERE ID_Usuario = ? AND ID_Post = ?', [req.userId, postId]);
            await db.execute('UPDATE T_Posts SET cant_likes = cant_likes - 1 WHERE ID_Post = ?', [postId]);
            res.json({ message: 'Like removido', liked: false });
        } else {
            // Dar like
            await db.execute('INSERT INTO T_Postlikes (ID_Usuario, ID_Post) VALUES (?, ?)', [req.userId, postId]);
            await db.execute('UPDATE T_Posts SET cant_likes = cant_likes + 1 WHERE ID_Post = ?', [postId]);
            res.json({ message: 'Like agregado', liked: true });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al procesar like' });
    }
});

// Guardar o quitar post guardado
router.post('/posts/:id/save', verifyToken, async (req, res) => {
    const postId = req.params.id;
    try {
        const [exists] = await db.execute(
            'SELECT * FROM T_Postguardados WHERE ID_Usuario = ? AND ID_Post = ?',
            [req.userId, postId]
        );
        if (exists.length) {
            await db.execute('DELETE FROM T_Postguardados WHERE ID_Usuario = ? AND ID_Post = ?', [req.userId, postId]);
            res.json({ message: 'Post removido de guardados', saved: false });
        } else {
            await db.execute('INSERT INTO T_Postguardados (ID_Usuario, ID_Post) VALUES (?, ?)', [req.userId, postId]);
            res.json({ message: 'Post guardado', saved: true });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

// Ocultar post (el usuario ya no lo ve en el feed)
router.post('/posts/:id/hide', verifyToken, async (req, res) => {
    const postId = req.params.id;
    try {
        await db.execute('INSERT INTO T_Postocultados (ID_Usuario, ID_Post) VALUES (?, ?) ON DUPLICATE KEY UPDATE hidden_at = CURRENT_TIMESTAMP', [req.userId, postId]);
        res.json({ message: 'Post ocultado' });
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

// Listar posts guardados por el usuario
router.get('/guardados', verifyToken, async (req, res) => {
    try {
        const [posts] = await db.execute(
            `SELECT p.*, ST_AsText(p.localizacion) as localizacion_text
             FROM T_Postguardados g
             JOIN T_Posts p ON g.ID_Post = p.ID_Post
             WHERE g.ID_Usuario = ?
             ORDER BY g.saved_at DESC`,
            [req.userId]
        );
        res.json(posts);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

module.exports = router;