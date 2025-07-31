// src/controllers/inviteController.ts
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { inviteClientSchema, registerViaInviteSchema } from '../../validations/invites/inviteValidations';
import { sendEmail } from '../../services/messages/emailService'; // Seu serviço de e-mail
import { randomUUID } from 'crypto'; // Para gerar UUIDs (já no Node.js)
import { hashPassword } from '../../utils/hash'; // Seu utilitário de hash de senha
import { generateToken } from '../../utils/jwt'; // Seu utilitário JWT para login automático

const prisma = new PrismaClient();

// Interface para estender o Request do Express com o usuário autenticado
interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        tenantId: string;
    };
}

// URL base do seu frontend, para construir o link de convite
const FRONTEND_BASE_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// 1. Endpoint de Envio de Convite (POST /api/cases/:lawsuitId/invite-client)
export const inviteClientToCase = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
        const { lawsuitId } = req.params;
        const { email } = inviteClientSchema.parse(req.body);
        const inviterUserId = req.user?.id;
        const tenantId = req.user?.tenantId;

        console.log(`[InviteController] Convite: Tentando enviar para ${email} no caso ${lawsuitId} pelo advogado ${inviterUserId} (Tenant: ${tenantId})`);

        if (!inviterUserId || !tenantId) {
            console.warn('[InviteController] Convite: Informações de autenticação incompletas.');
            return res.status(401).json({ message: 'Informações de autenticação incompletas. Usuário não autenticado ou token inválido.' });
        }

        // 1.1. Verificar se o lawsuitId existe e pertence ao tenant do advogado logado
        const caseItem = await prisma.case.findUnique({
            where: {
                id: lawsuitId,
                tenantId,
                lawyerPrimaryId: inviterUserId, // Garante que o advogado logado é o responsável pelo caso
            },
            select: { id: true, title: true, clientPrimaryId: true }, // Obter clientId do caso
        });

        if (!caseItem) {
            console.warn(`[InviteController] Convite: Caso ${lawsuitId} não encontrado ou não pertence ao advogado/tenant.`);
            return res.status(404).json({ message: 'Caso não encontrado ou você não tem permissão para convidar para este caso.' });
        }
        console.log(`[InviteController] Convite: Caso "${caseItem.title}" verificado.`);

        // 1.2. Verificar se já existe um User com esse email
        const existingUser = await prisma.user.findUnique({ where: { email } });
        const existingClient = await prisma.client.findUnique({ where: { email } }); // Verificar também em clientes se já tem

        if (existingUser || existingClient) {
            // Verificar se o User/Client existente já está associado a este caso ou tenant
            // Se o usuário já existe e está vinculado ao mesmo tenant e/ou ao mesmo caso, é um conflito
            if (existingUser && existingUser.tenantId === tenantId) {
                // Verificar se o usuário já é um advogado OU se é um cliente do mesmo escritório
                // E se ele já é o cliente do caso que estamos tentando convidar (caseItem.clientId)
                const isAlreadyAssociatedClient = existingClient && existingClient.id === caseItem.clientPrimaryId;
                if (isAlreadyAssociatedClient) {
                    console.warn(`[InviteController] Convite: Cliente ${email} já cadastrado e já associado a este caso.`);
                    return res.status(409).json({ message: 'Cliente já cadastrado e já associado a este caso.' });
                }
                if (existingUser.tenantId === tenantId) {
                    // O cliente já existe no mesmo escritório, podemos sugerir associá-lo, em vez de enviar convite de registro
                    // Para o MVP, vamos considerar um conflito que impede o envio de novo convite para registro.
                    console.warn(`[InviteController] Convite: Usuário/Cliente ${email} já existe em seu escritório. Considere associá-lo diretamente.`);
                    return res.status(409).json({ message: 'Usuário/Cliente já existe em seu escritório. Por favor, use a opção de "usar cliente já existente" se ele for um cliente existente, ou contate-o.' });
                }
            }
             // Se o email existir, mas pertencer a OUTRO tenant (outro escritório), ainda não podemos convidar para REGISTRO.
             // Isso exigiria uma lógica de "convidar usuário existente em outro tenant"
            if (existingUser && existingUser.tenantId !== tenantId) {
                 console.warn(`[InviteController] Convite: Usuário ${email} já existe em outro escritório.`);
                 return res.status(409).json({ message: 'Este e-mail já está em uso em outro escritório. Por favor, convide um e-mail diferente.' });
            }
        }

        // 1.3. Verificar se já existe um Invite pendente (não utilizado e não expirado)
        const existingInvite = await prisma.invite.findFirst({
            where: {
                email,
                caseId: lawsuitId,
                isUsed: false,
                expiresAt: {
                    gt: new Date(), // greater than now (não expirado)
                },
            },
        });

        if (existingInvite) {
            console.warn(`[InviteController] Convite: Já existe um convite pendente para ${email} no caso ${lawsuitId}.`);
            return res.status(409).json({ message: 'Já existe um convite pendente para este e-mail neste caso.' });
        }
        console.log(`[InviteController] Convite: Nenhuma pendência para ${email} no caso ${lawsuitId}.`);

        // 1.4. Gerar Token e Definir Expiração (24 horas)
        const inviteToken = randomUUID(); // UUID v4 como token
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24); // 24 horas a partir de agora

        // 1.5. Salvar Convite no Banco de Dados
        const newInvite = await prisma.invite.create({
            data: {
                email,
                token: inviteToken,
                caseId: lawsuitId,
                tenantId,
                expiresAt,
                isUsed: false,
                // inviterId: inviterUserId, // Descomente se adicionar inviterId no modelo Invite
            },
        });
        console.log(`[InviteController] Convite (ID: ${newInvite.id}) criado no DB para ${email}.`);

        // 1.6. Construção do Link de Convite
        const inviteLink = `${FRONTEND_BASE_URL}/register-client?token=${inviteToken}`; // Rota no frontend para registro via convite
        console.log(`[InviteController] Link de convite gerado: ${inviteLink}`);

        // 1.7. Envio de E-mail
        const subject = `Você foi convidado para um novo caso jurídico no Nexu Communication!`;
        const text = `Olá!\n\nVocê foi convidado pelo escritório ${tenantId} para acessar um caso jurídico no Nexu Communication.\n\nPara aceitar o convite e criar sua conta, clique no link abaixo:\n\n${inviteLink}\n\nEste link expira em 24 horas.\n\nAtenciosamente,\nEquipe Nexu Communication.`;
        const html = `
            <p>Olá!</p>
            <p>Você foi convidado pelo escritório <strong>${tenantId}</strong> para acessar um caso jurídico no Nexu Communication.</p>
            <p>Para aceitar o convite e criar sua conta, clique no link abaixo:</p>
            <p><a href="${inviteLink}">Aceitar Convite e Criar Conta</a></p>
            <p>Este link expira em 24 horas.</p>
            <p>Atenciosamente,<br/>Equipe Nexu Communication.</p>
        `;

        const emailSent = await sendEmail(email, subject, text, html);

        if (!emailSent) {
            console.error('[InviteController] Convite: Falha ao enviar e-mail de convite.');
            // Opcional: Marcar convite como 'falha no envio' ou tentar novamente
            return res.status(500).json({ message: 'Convite criado, mas falha ao enviar e-mail.' });
        }

        console.log(`[InviteController] Convite enviado com sucesso para ${email}.`);
        res.status(201).json({ message: 'Convite enviado com sucesso!', inviteId: newInvite.id });

    } catch (error: unknown) {
        if (error instanceof ZodError) {
            console.error('[InviteController] Convite: Erro de validação Zod:', error.issues);
            return res.status(400).json({ errors: error.issues.map(err => ({ path: err.path.join('.'), message: err.message })) });
        }
        console.error('[InviteController] Convite: Erro inesperado no envio:', error);
        next(error);
    }
};

// 2. Endpoint de Registro via Convite (POST /api/register/invite)
export const registerClientViaInvite = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { token, firstName, lastName, password } = registerViaInviteSchema.parse(req.body);

        console.log(`[InviteController] Registro via Convite: Tentando registrar cliente com token: ${token.substring(0, 8)}...`);

        // 2.1. Buscar e Validar o Convite
        const invite = await prisma.invite.findUnique({
            where: { token },
            include: { case: true }, // Incluir o caso para verificar clientId existente no caso
        });

        if (!invite) {
            console.warn('[InviteController] Registro via Convite: Convite inválido ou não encontrado.');
            return res.status(404).json({ message: 'Convite inválido ou não encontrado.' });
        }
        console.log(`[InviteController] Registro via Convite: Convite (ID: ${invite.id}) encontrado para ${invite.email}.`);

        if (invite.isUsed) {
            console.warn(`[InviteController] Registro via Convite: Convite ${invite.id} já utilizado.`);
            return res.status(400).json({ message: 'Convite já utilizado.' });
        }

        if (invite.expiresAt < new Date()) {
            console.warn(`[InviteController] Registro via Convite: Convite ${invite.id} expirado.`);
            // Opcional: Marcar convite como expirado no DB aqui
            return res.status(400).json({ message: 'Convite expirado.' });
        }
        console.log('[InviteController] Registro via Convite: Convite válido.');

        // 2.2. Verificar se já existe um User/Client com o email do convite
        const existingClient = await prisma.client.findUnique({ where: { email: invite.email } });

        if (existingClient) {
            // Se o cliente já existe, podemos associá-lo ao caso, mas não precisamos registrar de novo
            // Ou é um erro se o fluxo é apenas para novos registros
            console.warn(`[InviteController] Registro via Convite: Cliente com e-mail ${invite.email} já existe. Associando ao caso existente.`);
            // Assumimos que, se o cliente já existe, vamos usá-lo e associá-lo ao caso do convite
            // Em um cenário mais robusto, você poderia pedir para o usuário fazer login.

            // VERIFICAÇÃO ADICIONAL: O cliente existente já está vinculado a este caso?
            if (invite.case && invite.case.clientPrimaryId === existingClient.id) {
                console.warn(`[InviteController] Registro via Convite: Cliente ${existingClient.id} já associado ao caso ${invite.caseId}.`);
                return res.status(409).json({ message: 'Cliente já cadastrado e já associado a este caso.' });
            }

            // O cliente existe, mas não está associado a este caso.
            // Para simplicidade, vamos ATUALIZAR o caso para incluir este cliente.
            // Isso requer que a relação Case to Client seja 1:1, ou M:N se houver múltiplos clientes por caso.
            // SE SUA RELAÇÃO CASE-CLIENT É 1:1:
            await prisma.case.update({
                where: { id: invite.caseId },
                data: { clientPrimaryId: existingClient.id },
            });
            console.log(`[InviteController] Registro via Convite: Caso ${invite.caseId} atualizado para usar cliente existente ${existingClient.id}.`);
            
            // Marcar convite como usado
            await prisma.invite.update({
                where: { id: invite.id },
                data: { isUsed: true },
            });
            
            // Retornar o token de login para o cliente existente, se ele puder logar
            // Ou simplesmente informar que o convite foi processado.
            // Para este MVP, vamos retornar um sucesso simples e esperar que ele faça login.
            return res.status(200).json({ message: 'Convite processado. Você já está cadastrado e associado ao caso.', user: existingClient });

        } else {
            // 2.3. Cliente não existe, então criar novo User e Cliente
            const hashedPassword = await hashPassword(password);

            // Criar um novo Client e User (como cliente)
            // No seu schema, User e Client são modelos separados mas User tem a role lawyer.
            // Precisamos criar um Client (que é o que está no caso).
            // Em um sistema real, Cliente pode ser um tipo de User, ou ter seu próprio login.
            // Com seu schema atual (User é advogado, Client é o cliente da advocacia), o cliente não faz login diretamente.
            // Se o cliente vai ter uma tela de cliente e login, o modelo Client precisaria de 'password'.
            // Por enquanto, vamos criar um Cliente e considerar o 'password' para um futuro login de cliente.

            // Criando o Client no Tenant do advogado que enviou o convite
            const newClient = await prisma.client.create({
                data: {
                    email: invite.email,
                    firstName,
                    lastName,
                    tenantId: invite.tenantId, // O cliente pertence ao tenant do advogado que o convidou
                    // role: "client", // Se Client tivesse um campo role
                },
            });
            console.log(`[InviteController] Registro via Convite: Novo cliente (ID: ${newClient.id}) criado para ${newClient.email}.`);

            // Associar o novo cliente ao caso
            await prisma.case.update({
                where: { id: invite.caseId },
                data: { clientPrimaryId: newClient.id },
            });
            console.log(`[InviteController] Registro via Convite: Caso ${invite.caseId} associado ao novo cliente ${newClient.id}.`);

            // 2.4. Marcar o Convite como utilizado
            await prisma.invite.update({
                where: { id: invite.id },
                data: { isUsed: true },
            });
            console.log(`[InviteController] Registro via Convite: Convite ${invite.id} marcado como utilizado.`);

            // Opcional: Gerar token de sessão para o novo cliente (se o cliente tiver login)
            // Isso exigiria que o modelo Client tivesse campos de autenticação como 'password' e 'role'
            // E que você tivesse uma lógica de geração de token para clientes.
            // Por agora, o cliente se registra e o advogado é notificado. O cliente faria login em sua própria tela.
            res.status(201).json({
                message: 'Conta criada e associada ao caso com sucesso!',
                client: {
                    id: newClient.id,
                    firstName: newClient.firstName,
                    lastName: newClient.lastName,
                    email: newClient.email,
                    tenantId: newClient.tenantId,
                },
                // token: clientLoginToken // Se houvesse login automático para cliente
            });
        }

    } catch (error: unknown) {
        if (error instanceof ZodError) {
            console.error('[InviteController] Registro via Convite: Erro de validação Zod:', error.issues);
            return res.status(400).json({ errors: error.issues.map(err => ({ path: err.path.join('.'), message: err.message })) });
        }
        console.error('[InviteController] Registro via Convite: Erro inesperado:', error);
        next(error);
    }
};