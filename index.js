require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

app.use(cors());
app.use(express.json());

// 🔥 CONEXIÓN MYSQL (POOL)
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// 🧪 Ruta base
app.get('/', (req, res) => {
  res.send('API funcionando 🚀');
});


// 🔥 REGISTER (async/await)
app.post('/register', async (req, res) => {
  try {
    const { usuario, nombre, correo, password, telefono } = req.body;

    if (!usuario || !nombre || !correo || !password) {
      return res.status(400).json({ mensaje: 'Faltan datos' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.promise().query(
      `INSERT INTO T_Usuario (Usuario, Nombre, Correo, Contraseña, Telefono)
       VALUES (?, ?, ?, ?, ?)`,
      [usuario, nombre, correo, hashedPassword, telefono]
    );

    res.json({ mensaje: 'Usuario registrado correctamente' });

  } catch (error) {
    console.error('❌ ERROR REGISTER:', error);
    res.status(500).json({ mensaje: 'Error al registrar', error });
  }
});


// 🔐 LOGIN (100% estable)
app.post('/login', async (req, res) => {
  try {
    const { correo, password } = req.body;

    if (!correo || !password) {
      return res.status(400).json({ mensaje: 'Faltan datos' });
    }

    const [results] = await db.promise().query(
      'SELECT * FROM T_Usuario WHERE Correo = ?',
      [correo]
    );

    if (results.length === 0) {
      return res.status(401).json({ mensaje: 'Usuario no encontrado' });
    }

    const user = results[0];

    console.log('Usuario encontrado:', user.Correo);

    const validPassword = await bcrypt.compare(password, user.Contraseña);

    if (!validPassword) {
      return res.status(401).json({ mensaje: 'Contraseña incorrecta' });
    }

    const token = jwt.sign(
      { id: user.ID_Usuario },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      mensaje: 'Login exitoso',
      token,
      usuario: {
        ID_Usuario: user.ID_Usuario,
        Usuario: user.Usuario,
        Correo: user.Correo
      }
    });

  } catch (error) {
    console.error('❌ ERROR LOGIN TOTAL:', error);
    res.status(500).json({ mensaje: 'Error servidor', error });
  }
});


// 🚀 PUERTO (Railway)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});