import { Router } from "express"
import type { AuthRequest } from "@/middlewares/authMiddleware"
import { authenticateToken } from "../middlewares/authMiddleware"

const router = Router()

router.get("/me", authenticateToken, (req: AuthRequest, res) => {
  return res.status(200).json({ user: req.user })
})


export default router
