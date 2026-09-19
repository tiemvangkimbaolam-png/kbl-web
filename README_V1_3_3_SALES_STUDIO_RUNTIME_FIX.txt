KBL WEB SAFE MERGED · V1.3.3 SALES STUDIO RUNTIME FIX
Ngày: 19-09-2026

LỖI GỐC ĐÃ BẮT ĐƯỢC
- Backend /api/admin/growth-autopilot/status có thể trả dữ liệu thành công.
- Frontend renderGrowthPreparedPosts() khai báo biến `ready` bên trong block if(stats), nhưng sau đó dùng `ready` bên ngoài block.
- Trình duyệt ném ReferenceError: ready is not defined.
- loadGrowthAutopilot() trước đây bắt chung lỗi fetch + lỗi render nên gắn nhãn sai thành "LỖI API".

FIX
1) Đưa `ready` ra đúng scope của renderGrowthPreparedPosts().
2) Tách lỗi backend API và lỗi frontend render thành hai nhãn riêng:
   - LỖI API: chỉ khi fetch/status backend lỗi.
   - LỖI GIAO DIỆN: chỉ khi dữ liệu đã về nhưng render JS lỗi.
3) Không thay đổi app.js/backend, package.json, package-lock.json, Cloudflare Worker, AI Master, Gemini, Publisher, POS, Video hay Try-on.

KIỂM TRA
- node --check app.js: PASS
- 3 inline scripts trong views/admin.html: PASS
- Runtime smoke renderGrowthPreparedPosts() với 0 campaign và 1 READY campaign: PASS
- Xác nhận `ready` nằm đúng lexical scope: PASS
