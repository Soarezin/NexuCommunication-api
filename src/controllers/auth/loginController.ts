import { Request, Response } from "express"
import { loginUserService } from "../../services/auth/loginService"

export const loginUser = async (req: Request, res: Response) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: "Email e senha são obrigatórios." })
  }

  try {
    const { token, user } = await loginUserService(email, password)
    return res.status(200).json({ message: "Login bem-sucedido", token, user })
  } catch (error: any) {
    return res.status(401).json({ error: error.message })
  }
}
