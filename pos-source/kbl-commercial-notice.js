/* 2026 compliance reminder - UI only: no business math, storage or network operations. */
(() => {
  'use strict';
  function start() {
    const tab = document.getElementById('tab-caidat');
    if (!tab || tab.querySelector('#kbl-legal-checklist')) return;
    const info = document.createElement('section');
    info.id = 'kbl-legal-checklist';
    info.setAttribute('role', 'note');
    info.style.cssText = 'margin:18px 4px;padding:16px 18px;background:#eff7ff;border:1px solid #c6d8ea;border-left:5px solid #0f4876;border-radius:8px;line-height:1.55;color:#173c59;font-size:14px;';
    info.innerHTML = '<b>NHẮC VIỆC PHÁP LÝ KHI KINH DOANH</b>'
      + '<div>• Tổng giá trị mua/bán vàng từ <b>20 triệu đồng/ngày/khách</b>: thanh toán qua tài khoản của khách và doanh nghiệp theo NĐ 232/2025/NĐ-CP. Cần kiểm tra cộng dồn trong ngày trước khi nhận tiền.</div>'
      + '<div>• Phiếu bán/phiếu thu mua/biên bản do POS in là <b>chứng từ nội bộ</b>; không tự thay thế hóa đơn điện tử hợp lệ do hệ thống hóa đơn thuế phát hành.</div>'
      + '<div>• Thông tin CCCD, ảnh và hồ sơ khách cần được xử lý theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 và NĐ 356/2025/NĐ-CP; hạn chế người được truy cập, chỉ gửi lên đám mây khi có cơ sở xử lý phù hợp.</div>'
      + '<div>• Nghiệp vụ cầm đồ: cơ sở tự kiểm tra điều kiện kinh doanh, hợp đồng, cách thu lãi/phí và thủ tục thanh lý trước khi vận hành.</div>';
    tab.appendChild(info);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
