// src/controllers/authController.ts
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { hashPassword, comparePassword } from '../../utils/hash';
import { generateToken } from '../../utils/jwt';
import {
    RegisterInput,
    LoginInput,
    UpdateProfileInput,
    ChangePasswordInput
} from '../../validations/authValidations';

const prisma = new PrismaClient();

// Interface para estender o Request do Express com o usuário autenticado
// Seu middleware de autenticação deve popular req.user com id e tenantId
interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        tenantId: string;
    };
}

// Função de Registro
export const register = async (req: Request<any, any, RegisterInput>, res: Response, next: NextFunction) => {
    try {
        const { email, password, firstName, lastName, tenantName } = req.body;

        // 1. Verificar se o usuário já existe
        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return res.status(409).json({ message: 'Este e-mail já está em uso.' });
        }

        let tenant;
        // 2. Lógica de criação ou associação de Tenant
        if (!tenantName) {
            return res.status(400).json({ message: 'Nome do escritório (tenant) é obrigatório para o registro.' });
        }

        // Tentar encontrar um tenant existente com o nome fornecido
        const existingTenant = await prisma.tenant.findUnique({ where: { name: tenantName } });

        if (existingTenant) {
            // Se o tenant já existe, associar o usuário a ele
            // *AVISO*: Em um sistema de produção, considere uma lógica mais segura
            // para adicionar usuários a tenants existentes (ex: convites por admin).
            tenant = existingTenant;
        } else {
            // Se o tenant não existe, cria um novo
            tenant = await prisma.tenant.create({
                data: {
                    name: tenantName,
                },
            });
        }

        // 3. Hash da senha
        const hashedPassword = await hashPassword(password);

        // 4. Criar o novo usuário
        const newUser = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                firstName, // Propriedade 'firstName' existe agora no UserCreateInput
                lastName,  // Propriedade 'lastName' existe agora no UserCreateInput
                tenantId: tenant.id, // Propriedade 'tenantId' existe agora no UserCreateInput
            },
            select: { // Seleciona apenas os campos que você quer retornar
                id: true,
                email: true,
                firstName: true, // Propriedade 'firstName' existe agora no UserSelect
                lastName: true,  // Propriedade 'lastName' existe agora no UserSelect
                tenantId: true,  // Propriedade 'tenantId' existe agora no UserSelect
                createdAt: true,
            },
        });

        // 5. Gerar token para o novo usuário
        const token = generateToken({ id: newUser.id, tenantId: newUser.tenantId });

        res.status(201).json({
            message: 'Usuário registrado com sucesso!',
            user: newUser,
            token,
        });

    } catch (error: unknown) { // Tipagem explícita 'unknown'
        if (error instanceof ZodError) {
            const errors = error.issues.map(err => ({
                path: err.path.join('.'),
                message: err.message,
            }));
            return res.status(400).json({ errors });
        }
        next(error); // Passa para o middleware de tratamento de erro global
    }
};

// Função de Login
export const login = async (req: Request<any, any, LoginInput>, res: Response, next: NextFunction) => {
    try {
        const { email, password } = req.body;

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || !(await comparePassword(password, user.password))) {
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        const token = generateToken({ id: user.id, tenantId: user.tenantId });

        res.status(200).json({
            message: 'Login realizado com sucesso!',
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName, // Acessando propriedades corretas do User
                lastName: user.lastName,   // Acessando propriedades corretas do User
                tenantId: user.tenantId,   // Acessando propriedades corretas do User
            },
            token,
        });

    } catch (error: unknown) { // Tipagem explícita 'unknown'
        if (error instanceof ZodError) {
            const errors = error.issues.map(err => ({
                path: err.path.join('.'),
                message: err.message,
            }));
            return res.status(400).json({ errors });
        }
        next(error);
    }
};

// Função para Atualizar Perfil
export const updateProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { // Removido genéricos
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Usuário não autenticado.' });
        }

        // O body já foi validado pelo middleware Zod, então confiamos no tipo
        const updatedData: UpdateProfileInput = req.body;

        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: updatedData,
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                tenantId: true,
            },
        });

        res.status(200).json({
            message: 'Perfil atualizado com sucesso!',
            user: updatedUser,
        });

    } catch (error: unknown) { // Tipagem explícita 'unknown'
        if (error instanceof ZodError) {
            const errors = error.issues.map(err => ({
                path: err.path.join('.'),
                message: err.message,
            }));
            return res.status(400).json({ errors });
        }
        next(error);
    }
};

// Função para Alterar Senha
export const changePassword = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { // Removido genéricos
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: 'Usuário não autenticado.' });
        }

        // O body já foi validado pelo middleware Zod, então confiamos no tipo
        const { currentPassword, newPassword }: ChangePasswordInput = req.body;

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { password: true },
        });

        if (!user || !(await comparePassword(currentPassword, user.password))) {
            return res.status(401).json({ message: 'Senha atual incorreta.' });
        }

        const hashedNewPassword = await hashPassword(newPassword);

        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedNewPassword },
        });

        res.status(200).json({ message: 'Senha alterada com sucesso!' });

    } catch (error: unknown) { // Tipagem explícita 'unknown'
        if (error instanceof ZodError) {
            const errors = error.issues.map(err => ({
                path: err.path.join('.'),
                message: err.message,
            }));
            return res.status(400).json({ errors });
        }
        next(error);
    }
};