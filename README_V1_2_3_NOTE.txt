KBL GROWTH AUTOPILOT V1.2.3 - E2E ROUTER PROOF
Ngay: 19/09/2026

MUC TIEU
- Sua loi fallback carousel bi bao thieu 3 anh HTTPS du SKU co anh catalog-media hop le.
- KIEM TRA API + MEDIA phai probe that: heartbeat scheduler, OAuth/API, va 3 URL anh HTTPS tu hosting.
- Them nut DANG TEST THAT NGAY de chung minh duong Router -> Publisher -> API -> Post ID ma khong phu thuoc Gemini image.

DIEM CHINH
1. Growth fallback uu tien anh goc product.image / displayImage / content manifest va chuyen URL /api/catalog-media thanh HTTPS public.
2. Anh data URL neu gap trong luc publish co the duoc materialize vao public/uploads/studio truoc khi gui API.
3. AUTO READY chi xanh khi co scheduler heartbeat, co kenh API probe OK, va 3 anh HTTPS sample doc duoc tu hosting.
4. DANG TEST THAT NGAY uu tien Facebook -> Instagram -> Telegram. Test nay bo qua Gemini va dang 1 bai that bang 3 anh san pham sach de kiem tra E2E.
5. TEST +3 PHUT van giu nguyen de test scheduler theo thoi gian.
6. Khong fake PUBLISHED: chi tinh thanh cong khi Publisher/nen tang tra trang thai va Post/Media ID that.

CAI DAT
- Copy/paste de toan bo noi dung ban FULL vao repo kbl-web nhu quy trinh hien tai.
- GitHub Desktop: Commit -> Push origin.
- Plesk/hosting: deploy code moi -> Restart Node App.
- Doi 60-90 giay cho scheduler heartbeat.

TEST DE CHOT
A. Bam KIEM TRA API + MEDIA.
   Dat khi: AUTO READY E2E, MEDIA HTTPS 3/3, it nhat 1 API kenh OK.
B. Bam DANG TEST THAT NGAY.
   Day la BAI THAT. He thong uu tien kenh co fallback 3 anh sach, bo qua Gemini.
   Dat khi: QUEUED -> PROCESSING/PUBLISHED va co Post/Media ID that.
C. Sau khi B dat, Auto Publish da duoc chung minh end-to-end tren server; khong can mo may tinh 24/24.
