KBL WEB SAFE MERGED · GROWTH AUTOPILOT V1.2.6
Ngày vá: 19-09-2026

MỤC TIÊU BẢN NÀY
1) Vá deterministic phần QR / text / logo trên poster 3 sản phẩm.
2) Vá đường media static để lúc auto publish lấy đúng HTTPS image ổn định hơn.
3) Không đụng các AI đang chạy ổn định; nếu máy chủ chưa có Sharp thì hệ thống vẫn fallback về flow AI cũ.

NHỮNG GÌ ĐÃ THÊM
- Root package.json để mở bằng VS Code và npm install dễ hơn.
- app.js có patch additive V1.2.6:
  + tạo footer overlay deterministic bằng Sharp
  + chèn logo KBL + QR + text SKU / giá / note trực tiếp lên file PNG cuối
  + materialize media publish theo public static path rõ ràng hơn
  + growth payload nâng version lên 1.2.6
- Không sửa logic AI Master / Gemini Auto / các phần đã chốt trước đó.

CÁCH CHẠY
1) Mở folder bằng Visual Studio Code.
2) Chạy: npm install
3) Chạy: npm start
4) Nếu muốn test nhanh cú pháp: npm run check

LƯU Ý
- Để deterministic overlay hoạt động, nên cài được dependency Sharp từ package.json.
- Nếu Sharp chưa cài được, hệ thống vẫn dùng ảnh AI như bản trước nên không làm chết luồng đang chạy.
- Auto publish vẫn giữ nguyên triết lý: TikTok dùng 3 ảnh sạch; các nền còn lại ưu tiên poster branded.
