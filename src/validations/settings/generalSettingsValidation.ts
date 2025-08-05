// src/validations/settings/generalSettingsValidation.ts
import { z } from 'zod'

export const generalSettingsSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  businessName: z.string().min(2).max(100).optional(),
  workingDays: z.array(z.string()).optional(),
  workingHours: z
    .object({
      start: z.string(), // pode refinar com regex HH:MM
      end: z.string(),
    })
    .optional(),
})
