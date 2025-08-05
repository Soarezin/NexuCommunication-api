// src/controllers/settings/generalSettingsController.ts
import { Response } from 'express'
import * as generalSettingsService from '../../services/settings/generalSettingsService'
import { generalSettingsSchema } from '../../validations/settings/generalSettingsValidation'
import { AuthRequest } from '@/middlewares/authMiddleware'

export async function getGeneralSettings(req: AuthRequest, res: Response) {
  const tenantId = req.user?.tenantId
  if (!tenantId) return res.status(401).json({ message: 'Tenant não encontrado.' })

  const settings = await generalSettingsService.getByTenantId(tenantId)
  return res.json({ settings })
}

export async function updateGeneralSettings(req: AuthRequest, res: Response) {
  const tenantId = req.user?.tenantId
  if (!tenantId) return res.status(401).json({ message: 'Tenant não encontrado.' })

  try {
    const parsedData = generalSettingsSchema.parse(req.body)
    const updated = await generalSettingsService.update(tenantId, parsedData)
    return res.json({ settings: updated }) 
  } catch (err) {
    console.error(err)
    return res.status(400).json({ message: 'Dados inválidos', error: err })
  }
}
