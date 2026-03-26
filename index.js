require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Conexión a MySQL (Railway)
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  }
});

db.connect(err => {
  if (err) {
    console.error('Error de conexión:', err);
  } else {
    console.log('Conectado a Railway MySQL');
  }
});

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('API funcionando 🚀');
});

// Obtener usuarios
app.get('/usuarios', (req, res) => {
  db.query('SELECT * FROM T_Usuario', (err, results) => {
    if (err) {
      return res.status(500).json(err);
    }
    res.json(results);
  });
});

// Puerto dinámico (IMPORTANTE para Railway)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});