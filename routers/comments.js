const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');
const router = express.Router();

// Crear comentario
router.post('/posts/:postId/comments', verifyToken, async (req, res) => {
    const { comentario } = req.body;
    if (!comentario) return res.status(400).json({ error: 'El comentario no puede estar vacío' });
    try {
        const [result] = await db.execute(
            'INSERT INTO T_Comentarios (ID_Post, ID_Usuario, Comentario) VALUES (?, ?, ?)',
            [req.params.postId, req.userId, comentario]
        );
        // Actualizar contador de comentarios en el post
        await db.execute('UPDATE T_Posts SET cant_comentarios = cant_comentarios + 1 WHERE ID_Post = ?', [req.params.postId]);
        res.status(201).json({ message: 'Comentario agregado', commentId: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Error al comentar' });
    }
});

// Obtener comentarios de un post (con paginación)
router.get('/posts/:postId/comments', async (req, res) => {
    const { limite = 20, pagina = 1 } = req.query;
    const offset = (pagina - 1) * limite;
    try {
        const [comentarios] = await db.execute(
            `SELECT c.ID_Comentario, c.Comentario, c.likes, c.fecha, u.Usuario, u.Nombre, u.Fotodeperfil_url
             FROM T_Comentarios c
             JOIN T_Usuario u ON c.ID_Usuario = u.ID_Usuario
             WHERE c.ID_Post = ?
             ORDER BY c.fecha ASC
             LIMIT ? OFFSET ?`,
            [req.params.postId, parseInt(limite), offset]
        );
        res.json({ comentarios, pagina, limite });
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener comentarios' });
    }
});

// Eliminar comentario (solo autor o admin? por ahora solo autor)
router.delete('/comments/:commentId', verifyToken, async (req, res) => {
    try {
        const [comment] = await db.execute('SELECT ID_Usuario, ID_Post FROM T_Comentarios WHERE ID_Comentario = ?', [req.params.commentId]);
        if (!comment.length) return res.status(404).json({ error: 'Comentario no existe' });
        if (comment[0].ID_Usuario !== req.userId) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        await db.execute('DELETE FROM T_Comentarios WHERE ID_Comentario = ?', [req.params.commentId]);
        await db.execute('UPDATE T_Posts SET cant_comentarios = cant_comentarios - 1 WHERE ID_Post = ?', [comment[0].ID_Post]);
        res.json({ message: 'Comentario eliminado' });
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

// Dar/quitar like a un comentario
router.post('/comments/:commentId/like', verifyToken, async (req, res) => {
    const commentId = req.params.commentId;
    try {
        const [exists] = await db.execute(
            'SELECT * FROM T_Likesdecomentarios WHERE ID_Usuario = ? AND ID_Comentario = ?',
            [req.userId, commentId]
        );
        if (exists.length) {
            await db.execute('DELETE FROM T_Likesdecomentarios WHERE ID_Usuario = ? AND ID_Comentario = ?', [req.userId, commentId]);
            await db.execute('UPDATE T_Comentarios SET likes = likes - 1 WHERE ID_Comentario = ?', [commentId]);
            res.json({ liked: false });
        } else {
            await db.execute('INSERT INTO T_Likesdecomentarios (ID_Usuario, ID_Comentario) VALUES (?, ?)', [req.userId, commentId]);
            await db.execute('UPDATE T_Comentarios SET likes = likes + 1 WHERE ID_Comentario = ?', [commentId]);
            res.json({ liked: true });
        }
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

module.exports = router;