const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');
const { createPoint, parsePoint } = require('../utils/geospatial');
const router = express.Router();

// Crear un nuevo post
router.post('/', verifyToken, async (req, res) => {
    const { tipo_post, nombre_mascota, raza, descripcion, lat, lng, imagenes } = req.body;
    // imagenes es un array de { url, esPrimaria?: boolean }
    if (!tipo_post || !descripcion || lat === undefined || lng === undefined) {
        return res.status(400).json({ error: 'Faltan campos: tipo_post, descripcion, lat, lng' });
    }
    if (!['Perdido', 'Adopcion', 'Encontrado'].includes(tipo_post)) {
        return res.status(400).json({ error: 'tipo_post inválido' });
    }
    const point = createPoint(lat, lng);
    if (!point) return res.status(400).json({ error: 'Coordenadas inválidas' });

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        // Insertar post
        const [postResult] = await connection.execute(
            `INSERT INTO T_Posts (ID_Usuario, tipo_post, nombre_mascota, raza, descripcion, localizacion)
             VALUES (?, ?, ?, ?, ?, ST_GeomFromText(?, 4326))`,
            [req.userId, tipo_post, nombre_mascota || null, raza || null, descripcion, point]
        );
        const postId = postResult.insertId;

        // Insertar imágenes si vienen
        if (imagenes && Array.isArray(imagenes) && imagenes.length) {
            for (let i = 0; i < imagenes.length; i++) {
                const img = imagenes[i];
                const esPrimaria = img.esPrimaria === true || (i === 0 && !imagenes.some(im => im.esPrimaria));
                await connection.execute(
                    `INSERT INTO T_Imagenesdepost (ID_Post, imagen_url, imagenprimaria) VALUES (?, ?, ?)`,
                    [postId, img.url, esPrimaria]
                );
            }
        }
        await connection.commit();
        res.status(201).json({ message: 'Post creado', postId });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ error: 'Error al crear post' });
    } finally {
        connection.release();
    }
});

// Obtener posts con filtros (cercanos, tipo, estado, paginación)
router.get('/', async (req, res) => {
    const { lat, lng, radio_km = 5, tipo_post, estado, limite = 20, pagina = 1 } = req.query;
    let whereClauses = [];
    let params = [];
    let havingClause = '';

    if (lat && lng) {
        const radioMetros = parseFloat(radio_km) * 1000;
        // Usar ST_Distance_Sphere para filtrar por distancia
        whereClauses.push(`ST_Distance_Sphere(localizacion, ST_GeomFromText(?, 4326)) <= ?`);
        params.push(`POINT(${parseFloat(lng)} ${parseFloat(lat)})`, radioMetros);
        // También seleccionar la distancia
        havingClause = `, ST_Distance_Sphere(localizacion, ST_GeomFromText(?, 4326)) as distancia`;
        params.push(`POINT(${parseFloat(lng)} ${parseFloat(lat)})`);
    }

    if (tipo_post && ['Perdido', 'Adopcion', 'Encontrado'].includes(tipo_post)) {
        whereClauses.push(`p.tipo_post = ?`);
        params.push(tipo_post);
    }
    if (estado && ['Activo', 'Resuelto', 'Cerrado'].includes(estado)) {
        whereClauses.push(`p.estado = ?`);
        params.push(estado);
    }
    const offset = (pagina - 1) * limite;
    const whereSQL = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const query = `
        SELECT p.ID_Post, p.tipo_post, p.nombre_mascota, p.raza, p.descripcion, 
               p.cant_likes, p.cant_comentarios, p.cant_compartidos, p.estado,
               p.fechadepublicacion,
               ST_AsText(p.localizacion) as localizacion_text
               ${havingClause ? ', ' + havingClause.replace('SELECT', '') : ''}
        FROM T_Posts p
        ${whereSQL}
        ORDER BY p.fechadepublicacion DESC
        LIMIT ? OFFSET ?
    `;
    params.push(parseInt(limite), offset);
    try {
        const [posts] = await db.execute(query, params);
        // Procesar cada post para devolver lat/lng y las imágenes
        const postsConImagenes = await Promise.all(posts.map(async (post) => {
            const ubicacion = parsePoint(post.localizacion_text);
            const [imagenes] = await db.execute(
                'SELECT ID_Imagen, imagen_url, imagenprimaria FROM T_Imagenesdepost WHERE ID_Post = ? ORDER BY imagenprimaria DESC',
                [post.ID_Post]
            );
            return {
                ...post,
                localizacion: ubicacion,
                distancia: post.distancia || null,
                imagenes: imagenes
            };
        }));
        res.json({ posts: postsConImagenes, pagina, limite, total: posts.length });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener posts' });
    }
});

// Obtener un post específico con sus comentarios (los comentarios van en otro router)
router.get('/:id', async (req, res) => {
    const postId = req.params.id;
    try {
        const [posts] = await db.execute(
            `SELECT p.*, ST_AsText(p.localizacion) as localizacion_text, u.Usuario, u.Nombre, u.Fotodeperfil_url
             FROM T_Posts p
             JOIN T_Usuario u ON p.ID_Usuario = u.ID_Usuario
             WHERE p.ID_Post = ?`,
            [postId]
        );
        if (!posts.length) return res.status(404).json({ error: 'Post no encontrado' });
        const post = posts[0];
        post.localizacion = parsePoint(post.localizacion_text);
        delete post.localizacion_text;
        const [imagenes] = await db.execute('SELECT * FROM T_Imagenesdepost WHERE ID_Post = ?', [postId]);
        post.imagenes = imagenes;
        res.json(post);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener post' });
    }
});

// Actualizar estado del post (resuelto/cerrado) - solo autor
router.patch('/:id/estado', verifyToken, async (req, res) => {
    const { estado } = req.body;
    if (!['Activo', 'Resuelto', 'Cerrado'].includes(estado)) {
        return res.status(400).json({ error: 'Estado inválido' });
    }
    try {
        const [post] = await db.execute('SELECT ID_Usuario FROM T_Posts WHERE ID_Post = ?', [req.params.id]);
        if (!post.length) return res.status(404).json({ error: 'Post no existe' });
        if (post[0].ID_Usuario !== req.userId) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        await db.execute('UPDATE T_Posts SET estado = ? WHERE ID_Post = ?', [estado, req.params.id]);
        res.json({ message: 'Estado actualizado' });
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

// Eliminar post (solo autor)
router.delete('/:id', verifyToken, async (req, res) => {
    try {
        const [post] = await db.execute('SELECT ID_Usuario FROM T_Posts WHERE ID_Post = ?', [req.params.id]);
        if (!post.length) return res.status(404).json({ error: 'Post no existe' });
        if (post[0].ID_Usuario !== req.userId) {
            return res.status(403).json({ error: 'No autorizado' });
        }
        await db.execute('DELETE FROM T_Posts WHERE ID_Post = ?', [req.params.id]);
        res.json({ message: 'Post eliminado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar' });
    }
});

module.exports = router;