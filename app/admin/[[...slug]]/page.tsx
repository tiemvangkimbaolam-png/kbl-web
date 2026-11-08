import { requireChatGPTUser, chatGPTSignOutPath } from '@/app/chatgpt-auth';
import AdminApp from '@/app/components/admin';
export const dynamic = 'force-dynamic';
export default async function AdminPage({ params }: {
    params: Promise<{
        slug?: string[];
    }>;
}) { const { slug = [] } = await params, user = await requireChatGPTUser('/admin/' + slug.join('/')); return <AdminApp view={slug[0] || 'tong-quan'} userName={user.displayName} signOut={chatGPTSignOutPath('/')}/>; }
