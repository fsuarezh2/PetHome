require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./database/db');

// Importar routers
const authRouter = require('./routers/auth');
const usersRouter = require('./routers/users');
const postsRouter = require('./routers/posts');
const interactionsRouter = require('./routers/interactions');
const commentsRouter = require('./routers/comments');
const reportsRouter = require('./routers/reports');
const chatsRouter = require('./routers/chats');

const app = express();
app.use(cors());
app.use(express.json());

// Ruta de salud
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'API PetHome funcionando' });
});

// Montar routers
app.use('/api/auth', authRouter);       // /api/auth/register, /api/auth/login, /api/auth/verify
app.use('/api/usuarios', usersRouter);   // /api/usuarios/me, etc.
app.use('/api/posts', postsRouter);      // /api/posts/
app.use('/api/interactions', interactionsRouter);
app.use('/api/comments', commentsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/chats', chatsRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
});