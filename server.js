const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./database/db');
require('dotenv').config();

const app = express();
app.use(express.json());

// Middleware para validar token (para futuras rutas protegidas)
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];
    
    if (!token) {
        return res.status(403).json({ error: 'No se proporcionó token' });
    }
    
    jwt.verify(token.split(' ')[1], process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).json({ error: 'Token inválido' });
        }
        req.userId = decoded.id;
        req.username = decoded.username;
        next();
    });
};

// Ruta de registro
app.post('/api/register', async (req, res) => {
    try {
        const { usuario, nombre, correo, contraseña, telefono } = req.body;
        
        // Validar campos requeridos
        if (!usuario || !nombre || !correo || !contraseña) {
            return res.status(400).json({ 
                error: 'Faltan campos requeridos: usuario, nombre, correo y contraseña son obligatorios' 
            });
        }
        
        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(correo)) {
            return res.status(400).json({ error: 'Formato de correo inválido' });
        }
        
        // Hash de la contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(contraseña, salt);
        
        // Insertar usuario
        const [result] = await db.execute(
            'INSERT INTO T_Usuario (Usuario, Nombre, Correo, Contraseña, Telefono) VALUES (?, ?, ?, ?, ?)',
            [usuario, nombre, correo, hashedPassword, telefono || null]
        );
        
        res.status(201).json({
            message: 'Usuario registrado exitosamente',
            userId: result.insertId
        });
        
    } catch (error) {
        console.error(error);
        
        // Manejar errores de duplicados
        if (error.code === 'ER_DUP_ENTRY') {
            if (error.sqlMessage.includes('Usuario')) {
                return res.status(400).json({ error: 'El nombre de usuario ya existe' });
            }
            if (error.sqlMessage.includes('Correo')) {
                return res.status(400).json({ error: 'El correo electrónico ya está registrado' });
            }
            if (error.sqlMessage.includes('Nombre')) {
                return res.status(400).json({ error: 'El nombre ya está en uso' });
            }
        }
        
        res.status(500).json({ error: 'Error al registrar usuario' });
    }
});

// Ruta de login
app.post('/api/login', async (req, res) => {
    try {
        const { usuario, contraseña } = req.body;
        
        // Validar campos
        if (!usuario || !contraseña) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
        }
        
        // Buscar usuario por nombre de usuario o email
        const [users] = await db.execute(
            'SELECT ID_Usuario, Usuario, Nombre, Correo, Contraseña, Telefono, Fotodeperfil_url FROM T_Usuario WHERE Usuario = ? OR Correo = ?',
            [usuario, usuario]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }
        
        const user = users[0];
        
        // Verificar contraseña
        const isValidPassword = await bcrypt.compare(contraseña, user.Contraseña);
        
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        }
        
        // Generar token JWT
        const token = jwt.sign(
            { 
                id: user.ID_Usuario, 
                username: user.Usuario,
                nombre: user.Nombre,
                email: user.Correo
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Enviar respuesta sin la contraseña
        const userData = {
            id: user.ID_Usuario,
            usuario: user.Usuario,
            nombre: user.Nombre,
            correo: user.Correo,
            telefono: user.Telefono,
            fotoPerfil: user.Fotodeperfil_url
        };
        
        res.json({
            message: 'Login exitoso',
            token,
            user: userData
        });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al iniciar sesión' });
    }
});

// Ruta para verificar token (útil para mantener sesión)
app.get('/api/verify', verifyToken, async (req, res) => {
    try {
        const [users] = await db.execute(
            'SELECT ID_Usuario, Usuario, Nombre, Correo, Telefono, Fotodeperfil_url FROM T_Usuario WHERE ID_Usuario = ?',
            [req.userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        
        res.json(users[0]);
    } catch (error) {
        res.status(500).json({ error: 'Error al verificar usuario' });
    }
});

// Ruta de prueba
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'API PetHome funcionando' });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});