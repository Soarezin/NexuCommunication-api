// src/app.ts (ou server.ts)

import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import http from 'http'; // Importe o módulo http do Node.js
import { Server } from 'socket.io'; // Importe o Server do socket.io

import authRoutes from './routes/authRoutes';
import clientRoutes from './routes/clientRoutes';
import caseRoutes from './routes/caseRoutes';
import messageRoutes from './routes/messageRoutes'; // Vamos refatorar o controlador depois

import { errorHandler } from './middlewares/errror.middleware';
import { authenticateSocket } from './middlewares/socketAuthMiddleware'; // NOVO: Middleware de autenticação para WebSockets
import { setupSocketIO } from './socket'; // NOVO: Arquivo para configurar o Socket.IO

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// Crie um servidor HTTP a partir do aplicativo Express
const server = http.createServer(app);

// Inicialize o Socket.IO, passando o servidor HTTP
const io = new Server(server, {
    cors: { // Configure o CORS para o Socket.IO, similar ao Express
        origin: process.env.CLIENT_URL || "http://localhost:3000", // Permita apenas seu frontend
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Configure o Socket.IO com os listeners e a lógica de autenticação
setupSocketIO(io);

// Rotas da API REST
app.use('/auth', authRoutes);
app.use('/clients', clientRoutes);
app.use('/cases', caseRoutes);
app.use('/messages', messageRoutes); // As rotas HTTP ainda serão usadas para histórico e talvez fallback

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { // O servidor HTTP agora escuta, não o app Express diretamente
    console.log(`🚀 Servidor HTTP e WebSocket rodando na porta ${PORT}`);
    console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`DEBUG: JWT_SECRET carregado: ${process.env.JWT_SECRET ? 'Sim' : 'Não'}`);
    if (process.env.JWT_SECRET) {
    console.log(`DEBUG: Primeiros 5 caracteres do JWT_SECRET: ${process.env.JWT_SECRET.substring(0, 5)}`);
}
});