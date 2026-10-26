import { requireChatGPTUser, chatGPTSignOutPath, usesCloudflareAccess } from '@/app/chatgpt-auth';
import { Brand } from '@/app/components/ui';
export const dynamic='force-dynamic';
export default async function Customer(){
  if(usesCloudflareAccess()) return <main className="policy"><Brand/><h1>Phiếu và bảo hành của khách</h1><p>Quét QR hoặc dùng mã bảo mật trên phiếu để xem dữ liệu do POS gửi lên. Tài khoản khách riêng và tích điểm chưa được ghép vào bản mới.</p><a className="button" href="/tra-cuu">Tra cứu phiếu</a><p><a href="/">Về trang chủ</a></p></main>;
  const user=await requireChatGPTUser('/khach-hang');
  return <main className="policy"><Brand/><h1>Hồ sơ khách</h1><p>Xin chào {user.displayName}.</p><p>{user.email}</p><h2>Thông tin giao dịch</h2><p>Website mới chưa ghép lịch sử giao dịch, tích điểm hoặc phiếu cầm từ POS. Mã tra cứu chỉ được dùng sau khi kết nối nguồn chỉ đọc của cửa hàng.</p><p><a className="button secondary" href="/#pawn">Tra cứu phiếu cầm</a></p><p><a href="/#products">Xem sản phẩm</a> · <a href="/#contact">Liên hệ cửa hàng</a></p><p><a href={chatGPTSignOutPath('/')} target="_top">Đăng xuất</a></p></main>;
}
