import PosReceipt from '../../components/pos-receipt';
export const metadata = { title: 'Phiếu bảo hành · Kim Bảo Lâm', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function Warranty({ params }: { params: Promise<{token: string}> }) { return <PosReceipt initialToken={(await params).token}/>; }
