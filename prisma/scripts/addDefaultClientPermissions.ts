// prisma/scripts/addDefaultClientPermissions.ts

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const userId = "7b71fc87-948f-4227-a2a5-45215c885f04";

  // Lista de permissões padrão do CLIENTE (nomes)
  const permissionNames = [
    // 📄 Casos
    "cases:view",
    "cases:view_status",
    "cases:view_documents",
    "cases:upload_attachments",
    "cases:comment",
    "cases:sign_documents",

    // 💬 Comunicação
    "communication:send_message",
    "communication:receive_notifications",
    "communication:mark_read",
    "communication:start_conversations",

    // 📁 Documentos
    "documents:view",
    "documents:download",
    "documents:upload",
    "documents:view_versions",

    // 📅 Agenda
    "calendar:view",
    "calendar:reschedule",
    "calendar:confirm_attendance",

    // ⚙️ Conta
    "account:edit",
    "account:change_password",
    "account:manage_notifications",
    "account:view_invoices",

    // 📊 Outros (opcional)
    "extras:rate_service",
    "extras:fill_forms",
    "extras:view_history",
  ];

  // Buscar os IDs correspondentes às permissões
  const permissions = await prisma.permission.findMany({
    where: {
      name: {
        in: permissionNames,
      },
    },
  });

  if (permissions.length !== permissionNames.length) {
    const foundNames = permissions.map((p) => p.name);
    const missing = permissionNames.filter((name) => !foundNames.includes(name));
    console.error("⚠️ Permissões não encontradas no banco:", missing);
    return;
  }

  const dataToInsert = permissions.map((permission) => ({
    userId,
    permissionId: permission.id,
  }));

  // Inserir permissões
  await prisma.userPermission.createMany({
    data: dataToInsert,
    skipDuplicates: true,
  });

  console.log("✅ Permissões de cliente adicionadas com sucesso!");
}

main()
  .catch((e) => {
    console.error("❌ Erro ao adicionar permissões:", e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
