import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const userId = '7b71fc87-948f-4227-a2a5-45215c885f04';
  const caseId = '9eb4f29f-c896-4fe5-9bc5-c01e02a18d7a';

  // Buscar o client que tem esse userId
  const client = await prisma.client.findFirst({
    where: {
      userId,
    },
  });

  if (!client) {
    console.error('❌ Nenhum cliente encontrado para este usuário.');
    return;
  }

  const alreadyAdded = await prisma.caseParticipantClient.findFirst({
    where: {
      caseId,
      clientId: client.id,
    },
  });

  if (alreadyAdded) {
    console.log('ℹ️ Cliente já está vinculado ao caso como participante.');
    return;
  }

  // Adicionar como participante
  await prisma.caseParticipantClient.create({
    data: {
      caseId,
      clientId: client.id,
      type: 'OtherContact', // ou outro tipo se quiser
    },
  });

  console.log(`✅ Cliente ${client.id} adicionado ao caso ${caseId} com sucesso.`);
}

main()
  .catch((e) => {
    console.error('Erro ao vincular cliente ao caso:', e);
  })
  .finally(() => {
    prisma.$disconnect();
  });
