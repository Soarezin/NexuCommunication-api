// src/app.ts (ou server.ts)
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';

import authRoutes from './routes/authRoutes';
import clientRoutes from './routes/clientRoutes';
import caseRoutes from './routes/caseRoutes';
import messageRoutes from './routes/messageRoutes';
import inviteRoutes from './routes/inviteRoutes';
import permissionRoutes from './routes/permissionRoutes';
import userRoutes from './routes/userRoutes';
import generalSettingsRoutes from './routes/generalSettingsRoutes';
import chatRoutes from './routes/chatFileRoutes';

import { errorHandler } from './middlewares/errror.middleware';
import { authenticateSocket } from './middlewares/socketAuthMiddleware';
import { setupSocketIO } from './socket';


dotenv.config();

const app = express();

// Configurações CORS
app.use(cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173", 
    credentials: true,
}));
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:5173",
        methods: ["GET", "POST"],
        credentials: true
    }
});

setupSocketIO(io);

// Rotas da API REST
app.use('/auth', authRoutes);
app.use('/clients', clientRoutes);
app.use('/cases', caseRoutes);
app.use('/messages', messageRoutes);
app.use('/api', inviteRoutes);
app.use('/users', userRoutes); 
app.use('/permissions', permissionRoutes);
app.use('/settings/general', generalSettingsRoutes);
app.use('/chat', chatRoutes);

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Servidor HTTP e WebSocket rodando na porta ${PORT}`);
    console.log(`Ambiente: ${process.env.NODE_ENV || 'development'}`);
});