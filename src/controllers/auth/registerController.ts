import { Request, Response } from "express"
import { registerUserService } from "../../services/auth/registerService"

export const registerUser = async (req: Request, res: Response) => {
  const { name, email, password, role } = req.body

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "Todos os campos são obrigatórios, incluindo o papel do usuário (role)." })
  }

  if (role !== "lawyer" && role !== "client") {
    return res.status(400).json({ error: "O campo 'role' deve ser 'lawyer' ou 'client'." })
  }

  try {
    const user = await registerUserService({ name, email, password, role })
    return res.status(201).json({ message: "Usuário criado com sucesso", user })
  } catch (error: any) {
    console.error("Erro ao registrar usuário:", error)
    return res.status(500).json({ error: error.message || "Erro interno do servidor." })
  }
}
