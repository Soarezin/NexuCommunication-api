import bcrypt from "bcryptjs"
import { prisma } from "../../db"

export const registerUserService = async ({
  name,
  email,
  password,
  role,
}: {
  name: string
  email: string
  password: string
  role: string
}) => {
  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    throw new Error("Este e-mail já está em uso.")
  }

  const hashedPassword = await bcrypt.hash(password, 10)

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role,
    },
  })

  return user
}
