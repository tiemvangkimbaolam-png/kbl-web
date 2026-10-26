import { redirect } from 'next/navigation';
import { getChatGPTUser, chatGPTSignInPath, usesCloudflareAccess } from '@/app/chatgpt-auth';
import { Brand } from '@/app/components/ui';
export const dynamic='force-dynamic';
export default async function Login(){
  if(usesCloudflareAccess()) return <main className="policy"><Brand/><h1>Tra cứu giao dịch</h1><p>Quét QR trên phiếu bảo hành hoặc phiếu cầm để xem dữ liệu POS đã đồng bộ. Hồ sơ khách đăng nhập riêng chưa được kết nối trên bản mới.</p><p><a className="button" href="/tra-cuu">Tra cứu bằng mã QR</a></p><p><a href="/admin">Đăng nhập quản trị qua Cloudflare Access</a></p><a href="/">Quay lại trang chủ →</a></main>;
  const user=await getChatGPTUser();if(user)redirect('/khach-hang');
  return <main className="policy"><Brand/><h1>Đăng nhập / Tạo tài khoản</h1><p>Đăng nhập an toàn để mở hồ sơ khách trên website mới.</p><p><a className="button" href={chatGPTSignInPath('/khach-hang')} target="_top">Tiếp tục với ChatGPT</a></p><p><a href="/">Quay lại trang chủ →</a></p></main>;
}
