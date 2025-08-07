// src/controllers/cases/caseController.ts
import { Request, Response, NextFunction } from "express";
// >>> Importe os ENUMS e os novos modelos diretamente do Prisma Client <<<
import {
  PrismaClient,
  CaseStatus,
  CaseParticipantUserRole,
  CaseParticipantClientType,
} from "@prisma/client";
import { ZodError } from "zod";
// Importe os tipos de input. Verifique o caminho: ../validations/caseValidations
import {
  CreateCaseInput,
  UpdateCaseInput,
} from "../../validations/cases/caseValidations";

const prisma = new PrismaClient();

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    tenantId: string;
    role: string;
  };
}

// 1. Criar um novo caso (POST /cases)
export const createCase = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { title, description, status, clientId } = req.body;
    const tenantId = req.user?.tenantId;
    const lawyerId = req.user?.userId; // O advogado logado é o criador e advogado principal por padrão

    console.log(
      `[Backend Cases - createCase] Tentando criar caso para Tenant ID: ${tenantId}, Lawyer ID: ${lawyerId}`
    );
    console.log(
      `[Backend Cases - createCase] Dados recebidos: Título: ${title}, Cliente ID: ${clientId}`
    );

    if (!tenantId || !lawyerId) {
      console.warn(
        "[Backend Cases - createCase] Informações de autenticação incompletas."
      );
      return res
        .status(401)
        .json({
          message:
            "Informações de autenticação incompletas. Usuário não autenticado ou token inválido.",
        });
    }

    // 1.1. Verificar se o cliente (clientId) existe e pertence ao mesmo tenant
    const client = await prisma.client.findUnique({
      where: {
        id: clientId,
        tenantId,
      },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    if (!client) {
      console.warn(
        `[Backend Cases - createCase] Cliente ID ${clientId} não encontrado ou não pertence ao Tenant ID ${tenantId}.`
      );
      return res
        .status(404)
        .json({
          message: "Cliente não encontrado ou não pertence ao seu escritório.",
        });
    }
    console.log(
      `[Backend Cases - createCase] Cliente ${client.firstName} ${client.lastName} (ID: ${client.id}) verificado e pertence ao tenant.`
    );

    // 1.2. Criar o caso e associar os participantes em uma transação
    const newCase = await prisma.$transaction(async (tx) => {
      // Criar o caso
      const createdCase = await tx.case.create({
        data: {
          title,
          description,
          status: status as CaseStatus, // Converter string para Enum CaseStatus
          tenantId,
          lawyerPrimaryId: lawyerId,
          clientPrimaryId: client.id,
        },
      });
      console.log(
        `[Backend Cases - createCase] Caso (ID: ${createdCase.id}) criado.`
      );

      // Adicionar o advogado logado como participante do caso na tabela de junção
      await tx.caseParticipantUser.create({
        // Acessa o novo modelo CaseParticipantUser
        data: {
          caseId: createdCase.id,
          userId: lawyerId,
          role: CaseParticipantUserRole.LeadLawyer, // Define o papel do advogado no caso
        },
      });
      console.log(
        `[Backend Cases - createCase] Advogado ${lawyerId} adicionado como LeadLawyer.`
      );

      // Adicionar o cliente como participante do caso na tabela de junção
      await tx.caseParticipantClient.create({
        // Acessa o novo modelo CaseParticipantClient
        data: {
          caseId: createdCase.id,
          clientId: client.id,
          type: CaseParticipantClientType.MainContact, // Define o tipo de contato do cliente
        },
      });
      console.log(
        `[Backend Cases - createCase] Cliente ${client.id} adicionado como MainContact.`
      );

      // Retornar o caso com as relações incluídas para a resposta
      return tx.case.findUnique({
        where: { id: createdCase.id },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          tenantId: true,
          createdAt: true,
          updatedAt: true,
          lawyerPrimary: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          clientPrimary: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          participantsUsers: {
            select: {
              userId: true,
              role: true,
              user: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          participantsClients: {
            select: {
              clientId: true,
              type: true,
              client: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      });
    });

    if (!newCase) {
      throw new Error("Falha inesperada ao criar caso e participantes.");
    }

    console.log(
      `[Backend Cases - createCase] Caso '${newCase.title}' (ID: ${newCase.id}) criado com sucesso com participantes.`
    );
    res.status(201).json({
      message: "Caso criado com sucesso!",
      case: newCase,
    });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      console.error(
        "[Backend Cases - createCase] Erro de validação Zod:",
        error.issues
      );
      return res
        .status(400)
        .json({
          errors: error.issues.map((err) => ({
            path: err.path.join("."),
            message: err.message,
          })),
        });
    }
    console.error("[Backend Cases - createCase] Erro inesperado:", error);
    next(error);
  }
};

// 2. Listar todos os casos do tenant e do advogado (GET /cases)
export const getCases = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, tenantId, role } = req.user!;

    if (!tenantId || !userId || !role) {
      return res
        .status(401)
        .json({ message: "Usuário não autenticado corretamente." });
    }

    // Se for cliente, retorna apenas os casos em que ele está envolvido
    if (role === "Client") {
      // Busca o cliente associado ao usuário logado
      const client = await prisma.client.findFirst({
        where: {
          userId,
          tenantId,
        },
      });
    
      if (!client) {
        return res.status(404).json({
          message: "Cliente não encontrado para o usuário atual.",
        });
      }
    
      // Busca os casos em que o cliente é o principal ou participante
      const cases = await prisma.case.findMany({
        where: {
          tenantId,
          OR: [
            { clientPrimaryId: client.id },
            {
              participantsClients: {
                some: {
                  clientId: client.id,
                },
              },
            },
          ],
        },
        include: {
          lawyerPrimary: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          clientPrimary: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          participantsClients: {
            include: {
              client: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
          participantsUsers: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
      });
    
      return res.json({ cases });
    }    

    // Se não for cliente, retorna todos os casos do tenant
    const cases = await prisma.case.findMany({
      where: { tenantId },
      include: {
        lawyerPrimary: true,
        clientPrimary: true,
        participantsClients: true,
        participantsUsers: true,
      },
    });

    return res.json(cases);
  } catch (error) {
    console.error("Erro ao buscar casos:", error);
    return res.status(500).json({ message: "Erro interno ao buscar casos." });
  }
};

// 3. Obter caso por ID (GET /cases/:id)
export const getCaseById = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;

    console.log(
      `[Backend Cases - getCaseById] Tentando buscar caso ${id} para Tenant ID: ${tenantId}, User ID: ${userId}`
    );

    if (!tenantId || !userId) {
      return res.status(401).json({
        message:
          "Informações de autenticação incompletas. Usuário não autenticado ou token inválido.",
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { Client: true }, // Traz o client se for cliente
    });

    const isClient = user?.role === "Client";
    const clientId = user?.Client?.id;

    // 🔍 Ajuste da verificação de acesso
    const caseItem = await prisma.case.findFirst({
      where: {
        id,
        tenantId,
        OR: isClient
          ? [
              { clientPrimaryId: clientId },
              {
                participantsClients: {
                  some: {
                    clientId: clientId,
                  },
                },
              },
            ]
          : [
              { lawyerPrimaryId: userId },
              {
                participantsUsers: {
                  some: {
                    userId: userId,
                  },
                },
              },
            ],
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        tenantId: true,
        createdAt: true,
        updatedAt: true,
        lawyerPrimary: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        clientPrimary: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        participantsUsers: {
          select: {
            userId: true,
            role: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        participantsClients: {
          select: {
            clientId: true,
            type: true,
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            content: true,
            createdAt: true,
            senderId: true,
            receiverClientId: true,
            viewed: true,
            viewedAt: true,
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            receiverClient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        files: {
          select: {
            id: true,
            name: true,
            url: true,
          },
        },
      },
    });

    if (!caseItem) {
      console.warn(
        `[Backend Cases - getCaseById] Caso ${id} não encontrado ou usuário ${userId} não é participante/tenant.`
      );
      return res.status(404).json({
        message: "Caso não encontrado ou você não tem permissão para acessá-lo.",
      });
    }

    console.log(
      `[Backend Cases - getCaseById] Caso '${caseItem.title}' (ID: ${caseItem.id}) encontrado.`
    );
    res.status(200).json({ case: caseItem });
  } catch (error: unknown) {
    console.error(
      "[Backend Cases - getCaseById] Erro inesperado ao buscar caso por ID:",
      error
    );
    next(error);
  }
};

// 4. Atualizar caso (PUT /cases/:id)
export const updateCase = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;

    console.log(
      `[Backend Cases - updateCase] Tentando atualizar caso ${id} para Tenant ID: ${tenantId}, User ID: ${userId}`
    );
    console.log(
      `[Backend Cases - updateCase] Dados de atualização:`,
      updatedData
    );

    if (!tenantId || !userId) {
      console.warn(
        "[Backend Cases - updateCase] Informações de autenticação incompletas."
      );
      return res
        .status(401)
        .json({
          message:
            "Informações de autenticação incompletas. Usuário não autenticado ou token inválido.",
        });
    }

    const existingCase = await prisma.case.findUnique({
      where: {
        id,
        tenantId,
        participantsUsers: {
          some: {
            userId: userId,
          },
        },
      },
      select: { id: true },
    });

    if (!existingCase) {
      console.warn(
        `[Backend Cases - updateCase] Caso ${id} não encontrado ou usuário ${userId} não tem permissão para editá-lo.`
      );
      return res
        .status(404)
        .json({
          message:
            "Caso não encontrado ou você não tem permissão para editá-lo.",
        });
    }
    console.log(
      `[Backend Cases - updateCase] Caso ${id} verificado para atualização.`
    );

    const updatedCase = await prisma.case.update({
      where: {
        id,
        tenantId,
        // O usuário deve ser um participante para ter permissão de edição
        participantsUsers: {
          some: {
            userId: userId,
          },
        },
      },
      data: {
        title: updatedData.title,
        description: updatedData.description,
        status: updatedData.status as CaseStatus, // Converter string para Enum CaseStatus
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        tenantId: true,
        lawyerPrimary: { select: { id: true, firstName: true } },
        clientPrimary: { select: { id: true, firstName: true } },
      },
    });

    res.status(200).json({
      message: "Caso atualizado com sucesso!",
      case: updatedCase,
    });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      console.error(
        "[Backend Cases - updateCase] Erro de validação Zod:",
        error.issues
      );
      return res
        .status(400)
        .json({
          errors: error.issues.map((err) => ({
            path: err.path.join("."),
            message: err.message,
          })),
        });
    }
    console.error(
      "[Backend Cases - updateCase] Erro inesperado ao atualizar caso:",
      error
    );
    next(error);
  }
};

// 5. Remover caso (DELETE /cases/:id)
export const deleteCase = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;

    console.log(
      `[Backend Cases - deleteCase] Tentando deletar caso ${id} para Tenant ID: ${tenantId}, User ID: ${userId}`
    );

    if (!tenantId || !userId) {
      console.warn(
        "[Backend Cases - deleteCase] Informações de autenticação incompletas."
      );
      return res
        .status(401)
        .json({
          message:
            "Informações de autenticação incompletas. Usuário não autenticado ou token inválido.",
        });
    }

    const caseToDelete = await prisma.case.findUnique({
      where: {
        id,
        tenantId,
        participantsUsers: {
          some: {
            userId: userId,
          },
        },
      },
      select: { id: true },
    });

    if (!caseToDelete) {
      console.warn(
        `[Backend Cases - deleteCase] Caso ${id} não encontrado ou usuário ${userId} não tem permissão para deletá-lo.`
      );
      return res
        .status(404)
        .json({
          message:
            "Caso não encontrado ou você não tem permissão para deletá-lo.",
        });
    }
    console.log(
      `[Backend Cases - deleteCase] Caso ${id} verificado para deleção.`
    );

    await prisma.case.delete({
      where: {
        id,
        tenantId,
        participantsUsers: {
          some: {
            userId: userId,
          },
        },
      },
    });

    res.status(204).send();
    console.log(
      `[Backend Cases - deleteCase] Caso ${id} deletado com sucesso.`
    );
  } catch (error: unknown) {
    console.error(
      "[Backend Cases - deleteCase] Erro inesperado ao deletar caso:",
      error
    );
    next(error);
  }
};
