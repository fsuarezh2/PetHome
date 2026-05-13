const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const verifyToken = require('../middleware/auth'); // ✅ Importación única al inicio
const router = express.Router();

// Registro
router.post('/register', async (req, res) => {
    try {
        const { usuario, nombre, correo, contraseña, telefono } = req.body;
        if (!usuario || !nombre || !correo || !contraseña) {
            return res.status(400).json({ error: 'Faltan campos requeridos' });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(correo)) {
            return res.status(400).json({ error: 'Correo inválido' });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(contraseña, salt);
        const [result] = await db.execute(
            'INSERT INTO T_Usuario (Usuario, Nombre, Correo, Contraseña, Telefono) VALUES (?, ?, ?, ?, ?)',
            [usuario, nombre, correo, hashedPassword, telefono || null]
        );
        res.status(201).json({ message: 'Usuario registrado', userId: result.insertId });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            if (error.sqlMessage.includes('Usuario')) return res.status(400).json({ error: 'Usuario ya existe' });
            if (error.sqlMessage.includes('Correo')) return res.status(400).json({ error: 'Correo ya registrado' });
            if (error.sqlMessage.includes('Nombre')) return res.status(400).json({ error: 'Nombre ya en uso' });
        }
        console.error(error);
        res.status(500).json({ error: 'Error al registrar usuario' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { usuario, contraseña } = req.body;
        if (!usuario || !contraseña) {
            return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
        }
        const [users] = await db.execute(
            'SELECT ID_Usuario, Usuario, Nombre, Correo, Contraseña, Telefono, Fotodeperfil_url FROM T_Usuario WHERE Usuario = ? OR Correo = ?',
            [usuario, usuario]
        );
        if (users.length === 0) return res.status(401).json({ error: 'Credenciales incorrectas' });
        const user = users[0];
        const valid = await bcrypt.compare(contraseña, user.Contraseña);
        if (!valid) return res.status(401).json({ error: 'Credenciales incorrectas' });
        const token = jwt.sign(
            { id: user.ID_Usuario, username: user.Usuario, nombre: user.Nombre, email: user.Correo },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.json({
            message: 'Login exitoso',
            token,
            user: {
                id: user.ID_Usuario,
                usuario: user.Usuario,
                nombre: user.Nombre,
                correo: user.Correo,
                telefono: user.Telefono,
                fotoPerfil: user.Fotodeperfil_url
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error en login' });
    }
});

// Verificar token
router.get('/verify', verifyToken, async (req, res) => {
    try {
        const [users] = await db.execute(
            'SELECT ID_Usuario, Usuario, Nombre, Correo, Telefono, Fotodeperfil_url FROM T_Usuario WHERE ID_Usuario = ?',
            [req.userId]
        );
        if (users.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
        res.json(users[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al verificar' });
    }
});

module.exports = router;