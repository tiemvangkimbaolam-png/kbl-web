import { notFound } from 'next/navigation';
import { get } from '@/lib/kbl/store';
import { Brand } from '@/app/components/ui';
export const dynamic = 'force-dynamic';
export default async function Article({ params }: {
    params: Promise<{
        id: string;
    }>;
}) { const { id } = await params, a = await get('article', id); if (!a)
    notFound(); return <><header className="masthead"><div className="wrap"><Brand /><a href="/tin-tuc" className="button quiet">Tất cả bản tin ↗</a></div></header><article className="article-page"><p className="small muted">Xuất bản: {new Date(a.publishedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p><h1>{a.headline}</h1><p style={{ fontSize: '1.15rem' }}>{a.summary}</p><p className="small muted" style={{ marginTop: 20 }}>Số liệu theo hồ sơ chốt lúc {new Date(a.editionAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}, không phải báo giá trực tiếp.</p>{a.images?.map((im: any) => <figure key={im.assetId}><img src={'/api/media/' + im.assetId} alt={im.caption || 'Ảnh minh họa AI cho bản tin'} width="1080" height="608"/><figcaption className="small muted">Ảnh minh họa AI, không phải ảnh chụp sự kiện thực tế.</figcaption></figure>)}<div className="article-body">{a.script}</div><section className="card"><h3>Nguồn tham khảo</h3>{a.sourceUrls?.map((url: string) => <p key={url} className="small" style={{ overflowWrap: 'anywhere', marginTop: 12 }}><a href={url} target="_blank" rel="noreferrer">{url} ↗</a></p>)}</section></article></>; }
