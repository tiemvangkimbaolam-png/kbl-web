'use client';
import {useEffect,useState} from 'react';
import {date} from '../ui';

type Props={onAsk:(question?:string)=>void;onTry:()=>void;onFeedback:()=>void;onOpenTool:(tool:string)=>void;articles?:any[]};
type FooterProps={onAsk:(question?:string)=>void};

export function MarketSnapshot({onOpenTool}:{onOpenTool:(tool:string)=>void}){
 const [market,setMarket]=useState<any>(null),[fx,setFx]=useState<any>(null);
 useEffect(()=>{
  let active=true;
  async function update(){
   const [gold,rate]=await Promise.allSettled([
    fetch('/api/public/market',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Giá thế giới chưa khả dụng');return r.json();}),
    fetch('/api/public/fx',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Tỷ giá chưa khả dụng');return r.json();})
   ]);
   if(!active)return;
   if(gold.status==='fulfilled')setMarket(gold.value);
   else setMarket((prev:any)=>prev?{...prev,stale:true}:null);
   if(rate.status==='fulfilled')setFx(rate.value);
   else setFx((prev:any)=>prev?{...prev,stale:true}:null);
  }
  const tick=()=>{if(!document.hidden)void update();};
  void update();
  const timer=window.setInterval(tick,60000);
  window.addEventListener('kbl-home-refresh',tick);
  document.addEventListener('visibilitychange',tick);
  return()=>{active=false;window.clearInterval(timer);window.removeEventListener('kbl-home-refresh',tick);document.removeEventListener('visibilitychange',tick);};
 },[]);
 const gold=market?.available&&Number.isFinite(Number(market.xauUsd))&&Number(market.xauUsd)>0;
 const usd=fx?.available&&Number.isFinite(Number(fx.usdSell))&&Number(fx.usdSell)>0;
 const goldText=gold?'$'+Number(market.xauUsd).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
 const usdText=usd?Number(fx.usdSell).toLocaleString('vi-VN')+' đ':'Chưa có tỷ giá';
 return <aside className="home-market-card" aria-label="Giá vàng thế giới và tỷ giá tham khảo">
  <div className="home-market-title">GIÁ VÀNG THẾ GIỚI · THAM KHẢO</div>
  <strong className="home-market-xau" aria-label={'XAU/USD '+goldText+' trên một ounce'}>XAU/USD · {goldText} / oz</strong>
  <small>{market?.stale?'Bản lưu · ':''}Nguồn: {market?.goldUpdatedAt||'chưa có giờ nguồn'}{market?.fetchedAt?' · Đọc '+date(market.fetchedAt):''}</small>
  <button type="button" className="home-market-chart-link" onClick={()=>onOpenTool('history')}>Xem chi tiết & biểu đồ →</button>
  <div className="home-market-divider"/>
  <h3>Tỷ giá Vietcombank · USD bán ra</h3>
  <strong className="home-market-usd">{usdText} / USD</strong>
  <small>{fx?.stale?'Bản lưu · ':''}Thời điểm nguồn: {fx?.updatedAt||'chưa có'}{fx?.fetchedAt?' · Đọc '+date(fx.fetchedAt):''}</small>
  <a href="https://www.vietcombank.com.vn/KHCN/Cong-cu-tien-ich/Ty-gia" rel="noopener noreferrer" target="_blank">Nguồn Vietcombank ↗</a>
  <p className="home-market-disclaimer">Giá tham khảo, không dùng thay giá mua/bán của tiệm.</p>
 </aside>;
}

export function RestoredSections({onAsk,onTry,onFeedback,onOpenTool,articles=[]}:Props){
 const stories=(Array.isArray(articles)?articles:[]).filter(x=>x&&x.id&&x.headline).slice(0,3);
 return <>
  <section className="home-wrap home-restored home-story" id="story" aria-labelledby="home-story-title">
   <div className="home-section-heading"><div><p className="home-eyebrow">KIM BẢO LÂM · GIÁ TRỊ THẬT</p><h2 id="home-story-title">Tận tâm trong từng lựa chọn</h2></div><a href="/gioi-thieu" className="home-text-link">Tìm hiểu về chúng tôi ↗</a></div>
   <p>Khám phá trang sức, tham khảo bảng giá có thời điểm, tra cứu và nhận hỗ trợ trực tiếp. Thông tin sản phẩm, giá và tình trạng còn hàng được cửa hàng xác nhận trước giao dịch.</p>
   <details className="home-brand-video"><summary>Xem video giới thiệu cửa hàng</summary><video controls preload="none" playsInline poster="/reference-home/brand-message.jpg" aria-label="Video giới thiệu Kim Bảo Lâm"><source src="/reference-home/brand-message.mp4" type="video/mp4"/>Trình duyệt chưa hỗ trợ xem video này.</video></details>
   <div className="home-restored-tiles">
    <a href="#products"><strong>Trang sức & bộ sưu tập</strong><span>Tìm theo mẫu, tuổi vàng và mã SKU →</span></a>
    <button type="button" onClick={onTry}><strong>Thử trang sức online</strong><span>Mở tiện ích thử ảnh khi bạn chọn →</span></button>
    <button type="button" onClick={()=>onOpenTool('ring')}><strong>Hướng dẫn đo ni nhẫn</strong><span>Tra ni theo đường kính lòng nhẫn →</span></button>
    <a href="/vang-cua-toi"><strong>Vàng của tôi</strong><span>Theo dõi số vàng, mục tiêu và lịch sử riêng →</span></a>
   </div>
  </section>
  <section className="home-restored-band" id="customer-help" aria-labelledby="home-help-title"><div className="home-wrap">
   <div className="home-section-heading"><div><p className="home-eyebrow">TRA CỨU & CHĂM SÓC</p><h2 id="home-help-title">Tiện ích dành cho khách hàng</h2></div></div>
   <div className="home-restored-tiles">
    <a href="/tra-cuu"><strong>Tra cứu phiếu cầm</strong><span>Tra cứu từ mã hoặc QR trên phiếu →</span></a>
    <a href="/bao-hanh"><strong>Tra cứu bảo hành</strong><span>Kiểm tra thông tin bảo hành hợp lệ →</span></a>
    <button type="button" onClick={()=>onOpenTool('pawn')}><strong>Ước tính cầm đồ</strong><span>Xem lãi và phí tham khảo theo ngày →</span></button>
    <button type="button" onClick={()=>onAsk('Tôi cần hỗ trợ tư vấn tại Kim Bảo Lâm.')}><strong>Tư vấn AI</strong><span>Hỏi đáp và hỗ trợ qua khung chat →</span></button>
   </div>
  </div></section>
  <section className="home-wrap home-restored" id="guide" aria-labelledby="home-guide-title">
   <div className="home-section-heading"><div><p className="home-eyebrow">HƯỚNG DẪN & CAM KẾT</p><h2 id="home-guide-title">Thông tin trước và sau khi mua</h2></div></div>
   <div className="home-restored-tiles">
    <a href="/huong-dan-mua-hang.html"><strong>Hướng dẫn mua hàng</strong><span>Các bước chọn và yêu cầu giữ mẫu →</span></a>
    <a href="/chinh-sach-van-chuyen-giao-nhan.html"><strong>Vận chuyển · giao nhận</strong><span>Thông tin nhận hàng và giao hàng →</span></a>
    <a href="/chinh-sach-bao-hanh-doi-tra.html"><strong>Bảo hành · đổi trả</strong><span>Xem điều kiện chăm sóc sản phẩm →</span></a>
    <a href="/quy-trinh-tiep-nhan-giai-quyet-khieu-nai.html"><strong>Tiếp nhận ý kiến</strong><span>Quy trình hỗ trợ và giải quyết →</span></a>
   </div>
  </section>
  <section className="home-restored-band" id="market-news" aria-labelledby="home-news-title"><div className="home-wrap">
   <div className="home-section-heading"><div><p className="home-eyebrow">THỊ TRƯỜNG & KIẾN THỨC</p><h2 id="home-news-title">Tin vàng từ nguồn đã kiểm tra</h2></div><a href="/tin-tuc" className="home-text-link">Xem tất cả bản tin ↗</a></div>
   {stories.length?<div className="home-story-list">{stories.map(n=><article key={n.id}><p>{n.publishedAt?date(n.publishedAt):'Bản tin'}</p><h3><a href={'/tin-tuc/'+encodeURIComponent(n.id)}>{n.headline}</a></h3><p>{String(n.summary||'').slice(0,180)}</p><a href={'/tin-tuc/'+encodeURIComponent(n.id)}>Đọc bản tin →</a></article>)}</div>:<p className="home-no-news">Chưa có bản tin được công bố. Chỉ hiển thị bài có nguồn và biên nhận xuất bản.</p>}
  </div></section>
  <section className="home-wrap home-restored" id="faq" aria-labelledby="home-faq-title">
   <div className="home-section-heading"><div><p className="home-eyebrow">GIẢI ĐÁP THƯỜNG GẶP</p><h2 id="home-faq-title">Câu hỏi của khách hàng</h2></div></div>
   <div className="home-faq">
    <details><summary>Giá vàng trên web có phải giá chốt khi giao dịch không?</summary><p>Bảng giá thể hiện nguồn và thời điểm cập nhật. Cửa hàng xác nhận mức áp dụng tại thời điểm giao dịch.</p></details>
    <details><summary>Làm sao hỏi về một mẫu trang sức?</summary><p>Mở chi tiết mẫu hoặc tìm theo mã SKU. Cửa hàng sẽ xác nhận giá, tuổi vàng, trọng lượng, ảnh và tình trạng còn hàng.</p></details>
    <details><summary>Tôi có thể kiểm tra phiếu cầm và bảo hành ở đâu?</summary><p>Dùng mục <a href="/tra-cuu">Tra cứu phiếu cầm</a> hoặc <a href="/bao-hanh">Tra cứu bảo hành</a>. Chỉ tra cứu hồ sơ bằng thông tin hợp lệ.</p></details>
    <details><summary>Tôi muốn phản hồi hoặc cần tư vấn thêm?</summary><p>Liên hệ cửa hàng qua điện thoại, Zalo, hoặc mở tư vấn AI; hồ sơ riêng tư không hiển thị công khai.</p><button type="button" onClick={onFeedback}>Gửi góp ý</button></details>
   </div>
  </section>
 </>;
}

export function RestoredFooter({onAsk}:FooterProps){
 return <footer className="home-footer home-full-footer">
  <div className="home-wrap home-footer-grid">
   <div className="home-footer-brand">
    <a href="#home" className="home-brand"><img src="/kbl-logo.png" width="48" height="48" alt=""/><span><strong>KIM BẢO LÂM</strong><small>Vàng chuẩn · Giá minh bạch</small></span></a>
    <p>Website chính thức giới thiệu sản phẩm, bảng giá, tiện ích thử trang sức, tra cứu và hỗ trợ khách hàng của Kim Bảo Lâm.</p>
    <strong>CÔNG TY TNHH VÀNG BẠC ĐÁ QUÝ KIM BẢO LÂM</strong>
    <p>Mã số doanh nghiệp / MST: 3703496362</p>
    <p>Đăng ký lần đầu: 14/07/2026</p>
    <p>Cơ quan đăng ký: Phòng Đăng ký kinh doanh - Sở Tài chính Thành phố Hồ Chí Minh</p>
    <p>Địa chỉ: 59/1 Nguyễn Thị Tươi, Phường Tân Đông Hiệp, TP. Hồ Chí Minh</p>
    <p><a href="tel:0899979797">Điện thoại: 0899 979 797</a></p>
    <p><a href="https://zalo.me/0985325806" target="_blank" rel="noopener noreferrer">Zalo hỗ trợ: 0985 325 806</a></p>
    <p><a href="mailto:tiemvangkimbaolam@gmail.com">tiemvangkimbaolam@gmail.com</a></p>
   </div>
   <nav aria-label="Khám phá"><strong>Khám phá</strong><a href="#products">Sản phẩm</a><a href="#prices">Bảng giá vàng</a><a href="#story">Thử trang sức online</a><a href="#story">Đo size nhẫn</a><a href="/tra-cuu">Tra cứu phiếu cầm</a><a href="/thong-tin-doanh-nghiep.html">Thông tin doanh nghiệp</a></nav>
   <nav aria-label="Dịch vụ khách hàng"><strong>Dịch vụ khách hàng</strong><a href="/huong-dan-mua-hang.html">Hướng dẫn mua hàng</a><a href="/hinh-thuc-ho-tro-truc-tuyen.html">Hỗ trợ trực tuyến</a><a href="/chinh-sach-bao-hanh-doi-tra.html">Bảo hành / đổi trả</a><a href="/chinh-sach-van-chuyen-giao-nhan.html">Vận chuyển / giao nhận</a><a href="/quy-trinh-tiep-nhan-giai-quyet-khieu-nai.html">Tiếp nhận khiếu nại</a></nav>
   <nav aria-label="Chính sách"><strong>Chính sách</strong><a href="/chinh-sach-gia.html">Chính sách giá</a><a href="/chinh-sach-bao-mat.html">Bảo mật thông tin cá nhân</a><a href="/dieu-kien-han-che-cung-cap-hang-hoa-dich-vu.html">Điều kiện / hạn chế cung cấp</a><a href="/chinh-sach-giao-hang-doi-tra-hoan-tien.html">Giao hàng · đổi trả · hoàn tiền</a><a href="/chinh-sach-tri-an-khach-hang-than-thiet">Tri ân & khách hàng thân thiết</a><a href="/bo-chinh-sach.html">Xem toàn bộ chính sách</a></nav>
   <div className="home-footer-connect"><strong>Kết nối với chúng tôi</strong><div className="home-footer-social"><a href="https://www.facebook.com/lam1881997/" target="_blank" rel="noopener noreferrer" aria-label="Facebook">f</a><a href="https://zalo.me/0985325806" target="_blank" rel="noopener noreferrer" aria-label="Zalo">Z</a><button onClick={()=>onAsk()} aria-label="Mở chat tư vấn AI">AI</button></div><p>Nhận tư vấn, đặt lịch và hỗ trợ nhanh qua các kênh chính thức.</p><div className="home-footer-cert"><strong>Thông tin website</strong><a href="https://online.gov.vn/nen-tang/90607e85-4a3f-49cd-b47b-d5375b0ecac5" target="_blank" rel="noopener noreferrer" aria-label="Tra cứu thông báo với Bộ Công Thương"><img src="/reference-home/bo-cong-thuong.png" height="44" alt="Đã thông báo Bộ Công Thương"/></a></div></div>
  </div>
  <div className="home-wrap home-footer-bottom"><span>© 2026 Kim Bảo Lâm. Nội dung giá và tồn kho được xác nhận lại tại thời điểm giao dịch.</span><span><a href="/bo-chinh-sach.html">Bộ chính sách</a> · <a href="/thong-tin-doanh-nghiep.html">Thông tin doanh nghiệp</a></span></div>
 </footer>;
}

export function FloatingControls({onAsk,onReload}:FooterProps&{onReload:()=>void}){
 return <aside className="home-floating-controls" aria-label="Tiện ích nhanh">
  <button className="home-floating-ai" onClick={()=>onAsk()} aria-label="Mở khung tư vấn AI"><img src="/kbl-logo.png" width="28" height="28" alt=""/> <span>AI</span></button>
  <button type="button" aria-label="Làm mới dữ liệu" title="Làm mới dữ liệu" onClick={()=>{onReload();window.dispatchEvent(new Event('kbl-home-refresh'));}}>↻</button>
  <button type="button" aria-label="Lên đầu trang" title="Lên đầu trang" onClick={()=>window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}>↑</button>
 </aside>;
}
