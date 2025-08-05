import { Router } from 'express'
import * as controller from '../controllers/settings/generalSettingsController'
import { authenticateToken } from '../middlewares/authMiddleware'; // Para proteger a rota de envio de convite

const router = Router()

router.get('/:tenantId', authenticateToken,controller.getGeneralSettings)
router.put('/:tenantId', authenticateToken,controller.updateGeneralSettings)

export default router
