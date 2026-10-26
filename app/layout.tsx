import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Kim Bảo Lâm | Trang sức & Thị trường vàng', description: 'TIỆM VÀNG KIM BẢO LÂM — sản phẩm, bảng giá được chốt theo thời điểm và thông tin thị trường có nguồn.', icons: { icon: '/kbl-logo.png' } };
export default function RootLayout({ children }: {
    children: React.ReactNode;
}) { return <html lang="vi"><body>{children}</body></html>; }
