const express = require('express');
const db = require('../database/db');
const verifyToken = require('../middleware/auth');
const { createPoint, parsePoint } = require('../utils/geospatial');
const router = express.Router();

// Obtener mi perfil completo (incluyendo dirección)
router.get('/me', verifyToken, async (req, res) => {
    try {
        const [user] = await db.execute(
            `SELECT ID_Usuario, Usuario, Nombre, Correo, Telefono, Fotodeperfil_url, FechaRegistro 
             FROM T_Usuario WHERE ID_Usuario = ?`,
            [req.userId]
        );
        if (!user.length) return res.status(404).json({ error: 'Usuario no encontrado' });

        const [direccion] = await db.execute(
            `SELECT ID_Direccion, Calle, num_exterior, num_interior, colonia, codigopostal, 
                    ciudad, estado, clave_ine, ine_foto_frontal_url, ine_foto_trasera_url, is_verified,
                    ST_AsText(ubicacion_exacta) as ubicacion_text
             FROM T_Direccionusuario WHERE ID_Usuario = ?`,
            [req.userId]
        );

        let ubicacion = null;
        if (direccion.length && direccion[0].ubicacion_text) {
            ubicacion = parsePoint(direccion[0].ubicacion_text);
        }

        res.json({
            ...user[0],
            direccion: direccion.length ? { ...direccion[0], ubicacion_exacta: ubicacion } : null
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener perfil' });
    }
});

// Actualizar foto de perfil
router.put('/me/foto', verifyToken, async (req, res) => {
    const { foto_url } = req.body;
    if (!foto_url) return res.status(400).json({ error: 'Se requiere URL de la foto' });
    try {
        await db.execute('UPDATE T_Usuario SET Fotodeperfil_url = ? WHERE ID_Usuario = ?', [foto_url, req.userId]);
        res.json({ message: 'Foto actualizada', foto_url });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar foto' });
    }
});

// Crear o actualizar dirección (incluye ubicación geográfica)
router.post('/me/direccion', verifyToken, async (req, res) => {
    const { Calle, num_exterior, num_interior, colonia, codigopostal, ciudad, estado, lat, lng } = req.body;
    if (!Calle || !num_exterior || !colonia || !codigopostal || !ciudad || !estado || lat === undefined || lng === undefined) {
        return res.status(400).json({ error: 'Faltan campos obligatorios (incluye lat/lng)' });
    }
    const point = createPoint(lat, lng);
    if (!point) return res.status(400).json({ error: 'Coordenadas inválidas' });

    try {
        // Verificar si ya existe dirección
        const [existing] = await db.execute('SELECT ID_Direccion FROM T_Direccionusuario WHERE ID_Usuario = ?', [req.userId]);
        if (existing.length) {
            await db.execute(
                `UPDATE T_Direccionusuario SET Calle=?, num_exterior=?, num_interior=?, colonia=?, codigopostal=?,
                 ciudad=?, estado=?, ubicacion_exacta=ST_GeomFromText(?, 4326)
                 WHERE ID_Usuario = ?`,
                [Calle, num_exterior, num_interior || null, colonia, codigopostal, ciudad, estado, point, req.userId]
            );
            res.json({ message: 'Dirección actualizada' });
        } else {
            await db.execute(
                `INSERT INTO T_Direccionusuario (ID_Usuario, Calle, num_exterior, num_interior, colonia, codigopostal, ciudad, estado, ubicacion_exacta)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ST_GeomFromText(?, 4326))`,
                [req.userId, Calle, num_exterior, num_interior || null, colonia, codigopostal, ciudad, estado, point]
            );
            res.status(201).json({ message: 'Dirección creada' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al guardar dirección' });
    }
});

// Subir fotos de INE (frontal y trasera) y clave INE
router.post('/me/ine', verifyToken, async (req, res) => {
    const { clave_ine, ine_foto_frontal_url, ine_foto_trasera_url } = req.body;
    if (!clave_ine || !ine_foto_frontal_url || !ine_foto_trasera_url) {
        return res.status(400).json({ error: 'Faltan datos de INE' });
    }
    try {
        // Verificar si ya existe dirección
        const [existing] = await db.execute('SELECT ID_Direccion FROM T_Direccionusuario WHERE ID_Usuario = ?', [req.userId]);
        if (!existing.length) {
            return res.status(400).json({ error: 'Primero debe crear una dirección' });
        }
        await db.execute(
            `UPDATE T_Direccionusuario SET clave_ine = ?, ine_foto_frontal_url = ?, ine_foto_trasera_url = ?, is_verified = FALSE
             WHERE ID_Usuario = ?`,
            [clave_ine, ine_foto_frontal_url, ine_foto_trasera_url, req.userId]
        );
        res.json({ message: 'INE registrado, pendiente de verificación' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'Esa clave INE ya fue registrada por otro usuario' });
        }
        res.status(500).json({ error: 'Error al guardar INE' });
    }
});

module.exports = router;