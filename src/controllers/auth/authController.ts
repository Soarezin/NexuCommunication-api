// src/controllers/authController.ts
import { Request, Response, NextFunction } from 'express';
// >>> AJUSTE: Importe UserRole e outros tipos do Prisma Client <<<
import { PrismaClient, UserRole } from '@prisma/client';
import { ZodError } from 'zod';
import { hashPassword, comparePassword } from '../../utils/hash';
// >>> AJUSTE: generateToken agora precisa de mais dados, incluindo o role e as permissões <<<
import { generateToken, JwtPayload } from '../../utils/jwt';
import {
    RegisterInput,
    LoginInput,
    UpdateProfileInput,
    ChangePasswordInput
} from '../../validations/authValidations';

const prisma = new PrismaClient();

// >>> AJUSTE: A interface AuthenticatedRequest agora reflete o payload completo do JWT <<<
export interface AuthenticatedRequest extends Request {
    user?: JwtPayload;
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
        if (!tenantName) {
            return res.status(400).json({ message: 'Nome do escritório (tenant) é obrigatório para o registro.' });
        }

        const existingTenant = await prisma.tenant.findUnique({ where: { name: tenantName } });

        if (existingTenant) {
            tenant = existingTenant;
        } else {
            tenant = await prisma.tenant.create({
                data: {
                    name: tenantName,
                },
            });
        }

        const hashedPassword = await hashPassword(password);

        // >>> NOVO: Adicionar permissões padrão para o papel 'Lawyer' <<<
        // A lógica abaixo depende de você ter rodado o seed de permissões.
        const defaultLawyerPermissions = await prisma.permission.findMany({
            where: {
                name: {
                    in: [
                        'can_send_messages',
                        'can_edit_personal_profile',
                        'can_view_all_cases',
                        'can_create_case',
                        'can_edit_case',
                        'can_delete_case', // Adicionado para demonstração
                        'can_manage_subscription', // Exemplo de permissão de Admin
                    ]
                }
            }
        });

        // 4. Criar o novo usuário
        const newUser = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                firstName,
                lastName,
                tenantId: tenant.id,
                // >>> NOVO: Definir o papel padrão (ex: Lawyer) <<<
                role: UserRole.Lawyer,
                userPermissions: {
                    create: defaultLawyerPermissions.map(p => ({
                        permission: { connect: { id: p.id } }
                    }))
                }
            },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                tenantId: true,
                // >>> NOVO: Inclua o papel e as permissões na resposta <<<
                role: true,
                userPermissions: {
                    select: { permission: { select: { name: true } } }
                }
            },
        });

        // 5. Gerar token para o novo usuário
        const permissions = newUser.userPermissions.map(up => up.permission.name);
        const tokenPayload: JwtPayload = {
            userId: newUser.id, // Corrigido de id para userId
            tenantId: newUser.tenantId,
            role: newUser.role,
            permissions: permissions,
        };
        const token = generateToken(tokenPayload);

        res.status(201).json({
            message: 'Usuário registrado com sucesso!',
            user: { ...newUser, permissions }, // Anexar as permissões ao objeto do usuário na resposta
            token,
        });

    } catch (error: unknown) {
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

// Função de Login
export const login = async (req: Request<any, any, LoginInput>, res: Response, next: NextFunction) => {
    try {
        const { email, password } = req.body;

        // Buscar o usuário e suas permissões
        const user = await prisma.user.findUnique({
            where: { email },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                password: true, // Necessário para a comparação
                tenantId: true,
                role: true, // Inclua o papel
                userPermissions: { // Inclua as permissões
                    select: { permission: { select: { name: true } } }
                }
            },
        });

        if (!user || !(await comparePassword(password, user.password))) {
            return res.status(401).json({ message: 'Credenciais inválidas.' });
        }

        // Gerar token com role e permissões
        const permissions = user.userPermissions.map(up => up.permission.name);
        const tokenPayload: JwtPayload = {
            userId: user.id,
            tenantId: user.tenantId,
            role: user.role,
            permissions: permissions,
        };
        const token = generateToken(tokenPayload);
        
        // Retornar os dados do usuário na resposta (sem a senha)
        const { password: _, ...userWithoutPassword } = user;
        
        res.status(200).json({
            message: 'Login realizado com sucesso!',
            user: { ...userWithoutPassword, permissions }, // Anexar as permissões ao objeto do usuário
            token,
        });

    } catch (error: unknown) {
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

// >>> AJUSTE: updateProfile e changePassword precisam usar o user do JwtPayload <<<
// Função para Atualizar Perfil
export const updateProfile = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.userId; // Use userId do payload
        if (!userId) {
            return res.status(401).json({ message: 'Usuário não autenticado.' });
        }

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
                role: true, // Inclua o papel
            },
        });

        res.status(200).json({
            message: 'Perfil atualizado com sucesso!',
            user: updatedUser,
        });

    } catch (error: unknown) {
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
export const changePassword = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const userId = req.user?.userId; // Use userId do payload
        if (!userId) {
            return res.status(401).json({ message: 'Usuário não autenticado.' });
        }

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

    } catch (error: unknown) {
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