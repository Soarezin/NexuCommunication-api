// prisma/seed.ts
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs'; // Importe bcrypt para criptografar a senha do admin

const prisma = new PrismaClient();

const permissions = [
  // Permissões para Escritório
  { name: 'can_edit_office_info', description: 'Permite editar informações do escritório.' },
  { name: 'can_configure_practice_areas', description: 'Permite configurar áreas de atuação.' },
  { name: 'can_manage_subscription', description: 'Permite gerenciar a assinatura e o plano.' },
  { name: 'can_adjust_storage', description: 'Permite ajustar o espaço de armazenamento.' },
  { name: 'can_manage_addons', description: 'Permite contratar novas funcionalidades (add-ons).' },
  
  // Permissões para Usuários
  { name: 'can_create_user', description: 'Permite criar novos usuários (advogados ou equipe).' },
  { name: 'can_edit_user_data', description: 'Permite editar dados de usuários.' },
  { name: 'can_deactivate_user', description: 'Permite ativar/desativar usuários.' },
  { name: 'can_define_user_permissions', description: 'Permite definir permissões por usuário.' },
  { name: 'can_view_user_logs', description: 'Permite visualizar histórico de acessos e ações.' },

  // Permissões para Casos
  { name: 'can_create_case', description: 'Permite criar novos casos.' },
  { name: 'can_edit_case', description: 'Permite editar dados de casos.' },
  { name: 'can_delete_case', description: 'Permite apagar casos.' },
  { name: 'can_archive_case', description: 'Permite arquivar/desarquivar casos.' },
  { name: 'can_assign_case_members', description: 'Permite atribuir casos a membros da equipe.' },
  { name: 'can_view_all_cases', description: 'Permite visualizar todos os casos do escritório.' },
  { name: 'can_export_case_data', description: 'Permite exportar dados dos casos.' },

  // Permissões para Comunicação
  { name: 'can_send_messages', description: 'Permite enviar mensagens para clientes.' },
  { name: 'can_view_message_history', description: 'Permite ver histórico de mensagens por caso.' },
  { name: 'can_mark_message_as_viewed', description: 'Permite marcar mensagens como visualizadas.' },
  { name: 'can_receive_message_alerts', description: 'Permite receber alertas de mensagens não lidas.' },
  { name: 'can_forward_messages', description: 'Permite encaminhar mensagens internas.' },

  // Permissões para Documentos
  { name: 'can_upload_document', description: 'Permite enviar documentos para clientes.' },
  { name: 'can_receive_documents', description: 'Permite receber documentos dos clientes.' },
  { name: 'can_edit_document', description: 'Permite editar e substituir documentos.' },
  { name: 'can_request_digital_signature', description: 'Permite solicitar assinatura digital.' },
  { name: 'can_control_document_permissions', description: 'Permite controlar permissões de visualização/download.' },
  { name: 'can_manage_version_history', description: 'Permite gerenciar histórico de versões.' },

  // Permissões para Agenda
  { name: 'can_create_appointment', description: 'Permite criar compromissos e audiências.' },
  { name: 'can_link_appointment_to_case', description: 'Permite vincular compromissos a casos.' },
  { name: 'can_share_agenda_with_client', description: 'Permite compartilhar agenda com cliente.' },
  { name: 'can_reschedule_appointment', description: 'Permite reagendar compromissos.' },
  { name: 'can_manage_client_presence', description: 'Permite marcar presença ou ausência do cliente.' },
  { name: 'can_integrate_agenda', description: 'Permite integrar agenda com Google/Outlook.' },
  
  // Permissões para Conta e Sistema
  { name: 'can_change_password', description: 'Permite alterar a senha.' },
  { name: 'can_edit_personal_profile', description: 'Permite editar dados do perfil pessoal.' },
  { name: 'can_manage_notifications', description: 'Permite ativar/desativar notificações.' },
  { name: 'can_configure_reminders', description: 'Permite configurar alertas e lembretes.' },
  { name: 'can_access_reports', description: 'Permite acessar e baixar relatórios.' },
  
  // Permissões para Relatórios e Análises
  { name: 'can_generate_reports', description: 'Permite gerar relatórios por período.' },
  { name: 'can_view_analytics', description: 'Permite ver estatísticas de produtividade e andamento dos casos.' },
  { name: 'can_export_reports', description: 'Permite exportar dados em PDF ou Excel.' },
];

async function main() {
    console.log(`Iniciando o seeding de permissões e usuário admin...`);
    
    // Cria um tenant padrão para o admin
    const defaultTenant = await prisma.tenant.upsert({
        where: { name: 'Admin Company' },
        update: {},
        create: {
            name: 'Admin Company',
        },
    });

    // Adiciona todas as permissões ao banco de dados
    const allPermissions = [];
    for (const permission of permissions) {
        const createdPermission = await prisma.permission.upsert({
            where: { name: permission.name },
            update: { description: permission.description },
            create: permission,
        });
        allPermissions.push(createdPermission);
    }
    console.log(`Seeding de permissões concluído! Foram adicionadas ${allPermissions.length} permissões.`);

    // Cria um usuário Admin
    const adminEmail = 'admin@nexu.com';
    const adminPassword = 'adminpassword'; // Senha simples para o admin
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    
    const adminUser = await prisma.user.upsert({
        where: { email: adminEmail },
        update: {
            firstName: 'Admin',
            lastName: 'User',
            password: hashedPassword,
            role: UserRole.Admin, // Define o papel como Admin
        },
        create: {
            email: adminEmail,
            password: hashedPassword,
            firstName: 'Admin',
            lastName: 'User',
            role: UserRole.Admin,
            isActive: true,
            tenantId: defaultTenant.id,
        },
        select: {
            id: true,
        },
    });
    console.log(`Usuário admin criado/atualizado com o email: ${adminEmail}`);

    // Remove todas as permissões antigas do admin (para garantir que não haja duplicações)
    await prisma.userPermission.deleteMany({
        where: { userId: adminUser.id },
    });

    // Associa TODAS as permissões ao usuário Admin
    await prisma.userPermission.createMany({
        data: allPermissions.map(perm => ({
            userId: adminUser.id,
            permissionId: perm.id,
        })),
    });
    console.log(`Todas as permissões foram atribuídas ao usuário admin.`);

}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });