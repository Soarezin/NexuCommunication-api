import { prisma } from '../../db'

export async function getByTenantId(tenantId: string) {
  return prisma.generalSetting.findUnique({ where: { tenantId } })
}

export async function update(tenantId: string, data: any) {
  return prisma.generalSetting.upsert({
    where: { tenantId },
    update: data,
    create: { tenantId, ...data }
  })
}
