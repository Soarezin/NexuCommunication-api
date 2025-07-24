// src/validations/authValidations.ts
import { z } from 'zod';

// Schema para o registro de um novo usuário
export const registerSchema = z.object({
    email: z.string().email('Email inválido.').max(255),
    password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres.').max(255),
    firstName: z.string().min(1, 'Nome é obrigatório.').max(100),
    lastName: z.string().min(1, 'Sobrenome é obrigatório.').max(100),
    // Para o primeiro usuário, também podemos esperar um nome para o tenant
    tenantName: z.string().min(1, 'Nome do escritório/tenant é obrigatório.').max(255).optional(),
});

// Inferir o tipo TypeScript a partir do schema Zod
export type RegisterInput = z.infer<typeof registerSchema>;

// Schema para o login
export const loginSchema = z.object({
    email: z.string().email('Email inválido.').max(255),
    password: z.string().min(1, 'Senha é obrigatória.').max(255),
});

export type LoginInput = z.infer<typeof loginSchema>;


// Schema para edição de perfil
export const updateProfileSchema = z.object({
    firstName: z.string().min(1, 'Nome é obrigatório.').max(100).optional(),
    lastName: z.string().min(1, 'Sobrenome é obrigatório.').max(100).optional(),
    // Adicione outros campos que podem ser editados no perfil, ex:
    // phoneNumber: z.string().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;


// Schema para alteração de senha
export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Senha atual é obrigatória.'),
    newPassword: z.string().min(8, 'A nova senha deve ter no mínimo 8 caracteres.'),
    confirmNewPassword: z.string().min(8, 'Confirmação da nova senha é obrigatória.'),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'As novas senhas não coincidem.',
    path: ['confirmNewPassword'],
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;