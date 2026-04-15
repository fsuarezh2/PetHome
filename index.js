require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
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


// 🔥 REGISTER
app.post('/register', (req, res) => {
  const { usuario, nombre, correo, password, telefono } = req.body;

  if (!usuario || !nombre || !correo || !password) {
    return res.status(400).json({ mensaje: 'Faltan datos' });
  }

  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      console.error('❌ ERROR HASH:', err);
      return res.status(500).json({ mensaje: 'Error al encriptar' });
    }

    const sql = `
      INSERT INTO T_Usuario (Usuario, Nombre, Correo, Contraseña, Telefono)
      VALUES (?, ?, ?, ?, ?)
    `;

    db.query(
      sql,
      [usuario, nombre, correo, hashedPassword, telefono],
      (err, result) => {
        if (err) {
          console.error('❌ ERROR REGISTER:', err);
          return res.status(500).json({
            mensaje: 'Error al registrar',
            error: err
          });
        }

        res.json({
          mensaje: 'Usuario registrado correctamente'
        });
      }
    );
  });
});


// 🔐 LOGIN (CORREGIDO)
app.post('/login', (req, res) => {
  const { correo, password } = req.body;

  if (!correo || !password) {
    return res.status(400).json({ mensaje: 'Faltan datos' });
  }

  const sql = `SELECT * FROM T_Usuario WHERE Correo = ?`;

  db.query(sql, [correo], (err, results) => {
    if (err) {
      console.error('❌ ERROR LOGIN QUERY:', err);
      return res.status(500).json({ mensaje: 'Error servidor' });
    }

    if (results.length === 0) {
      return res.status(401).json({ mensaje: 'Usuario no encontrado' });
    }

    const user = results[0];

    // 🔥 bcrypt con callback (NO async/await)
    bcrypt.compare(password, user.Contraseña, (err, isMatch) => {
      if (err) {
        console.error('❌ ERROR BCRYPT:', err);
        return res.status(500).json({ mensaje: 'Error en contraseña' });
      }

      if (!isMatch) {
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
    });
  });
});


// 🚀 PUERTO (Railway)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});