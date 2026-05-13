const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');
const router = express.Router();

// Obtener o crear un chat con otro usuario
router.post('/usuarios/:userId', verifyToken, async (req, res) => {
    const otroId = req.params.userId;
    if (parseInt(otroId) === req.userId) {
        return res.status(400).json({ error: 'No puedes chatear contigo mismo' });
    }
    try {
        // Buscar si ya existe chat en cualquier orden
        let [chat] = await db.execute(
            `SELECT ID_Chat FROM T_Chats 
             WHERE (ID_Usuario1 = ? AND ID_Usuario2 = ?) OR (ID_Usuario1 = ? AND ID_Usuario2 = ?)`,
            [req.userId, otroId, otroId, req.userId]
        );
        if (chat.length) {
            return res.json({ chatId: chat[0].ID_Chat });
        }
        // Crear nuevo chat
        const [result] = await db.execute(
            'INSERT INTO T_Chats (ID_Usuario1, ID_Usuario2) VALUES (?, ?)',
            [req.userId, otroId]
        );
        res.status(201).json({ chatId: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al crear chat' });
    }
});

// Listar chats del usuario actual
router.get('/', verifyToken, async (req, res) => {
    try {
        const [chats] = await db.execute(
            `SELECT c.ID_Chat, 
                    CASE WHEN c.ID_Usuario1 = ? THEN c.ID_Usuario2 ELSE c.ID_Usuario1 END as otro_usuario_id,
                    u.Usuario as otro_usuario_nombre, u.Fotodeperfil_url as otro_usuario_foto,
                    (SELECT contenido FROM T_Mensajes WHERE ID_Chat = c.ID_Chat ORDER BY fechadeenvio DESC LIMIT 1) as ultimo_mensaje,
                    (SELECT fechadeenvio FROM T_Mensajes WHERE ID_Chat = c.ID_Chat ORDER BY fechadeenvio DESC LIMIT 1) as ultima_actividad
             FROM T_Chats c
             JOIN T_Usuario u ON (u.ID_Usuario = CASE WHEN c.ID_Usuario1 = ? THEN c.ID_Usuario2 ELSE c.ID_Usuario1 END)
             WHERE c.ID_Usuario1 = ? OR c.ID_Usuario2 = ?
             ORDER BY ultima_actividad DESC`,
            [req.userId, req.userId, req.userId, req.userId]
        );
        res.json(chats);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener chats' });
    }
});

// Obtener mensajes de un chat
router.get('/:chatId/mensajes', verifyToken, async (req, res) => {
    const { limite = 50, antesDe } = req.query;
    let query = `
        SELECT m.ID_Mensajes, m.contenido, m.archivo_url, m.tipo_archivo, m.leido, m.fechadeenvio, m.ID_Usuario,
               u.Usuario, u.Nombre, u.Fotodeperfil_url
        FROM T_Mensajes m
        JOIN T_Usuario u ON m.ID_Usuario = u.ID_Usuario
        WHERE m.ID_Chat = ?
    `;
    let params = [req.params.chatId];
    if (antesDe) {
        query += ` AND m.ID_Mensajes < ?`;
        params.push(antesDe);
    }
    query += ` ORDER BY m.fechadeenvio DESC LIMIT ?`;
    params.push(parseInt(limite));
    try {
        const [mensajes] = await db.execute(query, params);
        // Marcar mensajes no leídos como leídos si el usuario actual es el receptor
        await db.execute(
            `UPDATE T_Mensajes SET leido = TRUE 
             WHERE ID_Chat = ? AND ID_Usuario != ? AND leido = FALSE`,
            [req.params.chatId, req.userId]
        );
        res.json(mensajes.reverse()); // orden ascendente para mostrar
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener mensajes' });
    }
});

// Enviar mensaje (texto o archivo)
router.post('/:chatId/mensajes', verifyToken, async (req, res) => {
    const { contenido, archivo_url, tipo_archivo } = req.body;
    if (!contenido && !archivo_url) {
        return res.status(400).json({ error: 'Debe enviar texto o un archivo' });
    }
    try {
        // Verificar que el usuario pertenezca al chat
        const [chat] = await db.execute(
            'SELECT * FROM T_Chats WHERE ID_Chat = ? AND (ID_Usuario1 = ? OR ID_Usuario2 = ?)',
            [req.params.chatId, req.userId, req.userId]
        );
        if (!chat.length) return res.status(403).json({ error: 'No perteneces a este chat' });

        await db.execute(
            `INSERT INTO T_Mensajes (ID_Chat, ID_Usuario, contenido, archivo_url, tipo_archivo)
             VALUES (?, ?, ?, ?, ?)`,
            [req.params.chatId, req.userId, contenido || null, archivo_url || null, tipo_archivo || null]
        );
        res.status(201).json({ message: 'Mensaje enviado' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al enviar mensaje' });
    }
});

module.exports = router;