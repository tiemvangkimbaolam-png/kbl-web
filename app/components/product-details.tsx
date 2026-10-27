'use client';
import { useState } from 'react';
import { ImageIcon, MessageCircle, ShoppingBag } from 'lucide-react';
import { productFacts } from '@/lib/kbl/product-view.mjs';
import { cash, date } from './ui';
const weight = (n: number | null) => n === null ? 'Chưa có dữ liệu' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(n) + ' chỉ';
export default function ProductDetails({ product: p, onAsk, onReserve }: { product: any; onAsk?: () => void; onReserve?: () => void }) {
    const facts = productFacts(p), [selectedImage, setImage] = useState('');
    const image = facts.imageIds.includes(selectedImage) ? selectedImage : facts.imageIds[0] || '';
    const available = p.available === true && p.published === true;
    return <div className="kbl-product-detail">
        <figure className="kbl-product-gallery">
            {image ? <a href={'/api/media/' + image} target="_blank" rel="noreferrer" aria-label={'Mở ảnh gốc ' + p.name}><img src={'/api/media/' + image} alt={p.name} width={640} height={640}/></a> : <div className="kbl-product-no-image"><ImageIcon size={40}/><span>Chưa đồng bộ ảnh sản phẩm</span></div>}
            {facts.imageIds.length > 1 && <div className="kbl-product-thumbnails">{facts.imageIds.map((id: string, i: number) => <button type="button" key={id} aria-label={'Ảnh ' + (i + 1)} aria-pressed={id === image} onClick={() => setImage(id)}><img src={'/api/media/' + id} alt={'Góc ảnh ' + (i + 1)} width={64} height={64}/></button>)}</div>}
            {image && <figcaption>Ảnh sản phẩm đã đồng bộ từ cửa hàng. Bấm ảnh để xem bản gốc.</figcaption>}
        </figure>
        <div className="stack">
            <p className="small muted">Mã sản phẩm <strong>{p.sku}</strong></p>
            {p.description && <p style={{ whiteSpace: 'pre-wrap' }}>{p.description}</p>}
            <dl className="kbl-product-facts">
                <div><dt>Tuổi vàng</dt><dd>{String(p.purity).replace(/^9999$/, '999.9')}</dd></div>
                <div><dt>{p.source === 'pos' ? 'Trọng lượng vàng ròng' : 'Trọng lượng'}</dt><dd>{p.source === 'pos' ? weight(facts.netWeightChi) : (p.weight > 0 ? new Intl.NumberFormat('vi-VN').format(p.weight) + ' g' : 'Chưa có dữ liệu')}</dd></div>
                {facts.grossWeightChi !== null && <div><dt>Tổng trọng lượng</dt><dd>{weight(facts.grossWeightChi)}</dd></div>}
                {facts.stoneWeightChi !== null && <div><dt>Trọng lượng hột/đá</dt><dd>{weight(facts.stoneWeightChi)}</dd></div>}
                {facts.posGoldRate !== undefined && <div><dt>Đơn giá vàng POS</dt><dd>{cash(facts.posGoldRate)} / chỉ</dd></div>}
                {facts.posWorkmanship !== undefined && <div><dt>Tiền công bán</dt><dd>{cash(facts.posWorkmanship)}</dd></div>}
                <div><dt>Tình trạng</dt><dd>{available ? 'Đang trưng bày' : 'Cần kiểm tra lại tại cửa hàng'}</dd></div>
            </dl>
            <div><p className="small muted">Giá tham khảo của sản phẩm</p><h3 className="kbl-product-total">{cash(p.price)}</h3></div>
            <p className="small muted">{p.updatedAt ? 'Đồng bộ ' + date(p.updatedAt) + '. ' : ''}Giá lấy từ POS; cửa hàng xác nhận lại giá và tồn kho khi giao dịch.</p>
            <div className="row" style={{ flexWrap: 'wrap' }}>
                {onReserve && available && p.price !== null && <button type="button" className="button" onClick={onReserve}><ShoppingBag size={16}/>Giữ mẫu này</button>}
                {onAsk ? <button type="button" className="button secondary" onClick={onAsk}><MessageCircle size={16}/>Hỏi về sản phẩm này</button> : <a className="button secondary" href={'/?tu-van=' + encodeURIComponent(p.sku)}><MessageCircle size={16}/>Hỏi về sản phẩm này</a>}
            </div>
        </div>
    </div>;
}
