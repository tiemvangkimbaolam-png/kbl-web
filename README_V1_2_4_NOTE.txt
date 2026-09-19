KBL GROWTH AUTOPILOT V1.2.4 - NANO BANANA + STATIC MEDIA
Ngay: 19/09/2026

MUC TIEU
- Goi Gemini Image/Nano Banana bang API hien hanh de tao poster social 4:5 tu anh san pham that.
- Khong de HTTP 429 cua Gemini lam mat bai: fallback media sach van duoc giu.
- Xu ly loi nen tang khong tai duoc anh tu route dong /api/catalog-media/... bang cach materialize thanh file static HTTPS trong /public/uploads/studio truoc khi Publisher gui URL cho Facebook/Instagram/TikTok/Telegram.
- Co test tach rieng de chung minh tung tang: API + static media, upload anh Meta, Nano Banana, roi moi publish that.

THAY DOI CHINH
1. Nano Banana
- Model uu tien: gemini-3.1-flash-image (Nano Banana 2).
- Fallback: gemini-3.1-flash-lite-image / gemini-3-pro-image / gemini-2.5-flash-image theo cau hinh va kha dung.
- Thu Interactions API truoc, co generateContent fallback.
- Anh catalog route dong duoc server doc bytes truoc khi gui lam reference cho Gemini.
- Prompt poster test dung phong cach nhung do sang trong + den champagne, dung du lieu SKU that.

2. Static media upload route
- Moi anh san pham truoc publish duoc server doc bytes va luu vao /public/uploads/studio.
- Publisher nhan URL HTTPS static thay vi phu thuoc truc tiep /api/catalog-media route dong.
- Neu khong materialize du 3/3 anh: chuyen media-review va hien ly do, khong lam bai bien mat.

3. Kiem tra thuc te
- KIEM TRA API + STATIC MEDIA: scheduler + OAuth/API + 3 anh static HTTPS.
- TEST TAI ANH META: Facebook tai that 1 anh static vao /photos voi published=false; phai tra Photo ID. Sau do he thong thu xoa anh nhap.
- TEST NANO BANANA: tao 1 poster tu SKU that, luu static va mo URL ket qua.
- DANG TEST THAT NGAY: test end-to-end Router -> Publisher -> API -> Post ID.

LUU Y QUOTA GEMINI
- HTTP 429 / RESOURCE_EXHAUSTED la quota/rate limit/project billing cua Google. Code khong the tu mo quota.
- V1.2.4 phan biet loi quota voi loi media route va giu fallback anh san pham that de Autopilot khong dung toan bo.

QR
- Khong yeu cau model AI tu ve QR vi QR sinh bang generative image co the khong quet duoc.
- Website tiemvangkimbaolam.id.vn duoc giu dang text chinh xac. Neu can QR tren poster production, nen overlay QR that bang compositor deterministic o buoc sau.

CAI DAT
- Giai nen FULL.
- Copy/paste de len repo kbl-web nhu quy trinh hien tai.
- GitHub Desktop: Commit -> Push origin.
- Plesk: deploy/update code -> Restart Node App.
- Cho 60-90 giay de scheduler heartbeat chay.

THU TU TEST
1. KIEM TRA API + STATIC MEDIA -> can 3/3 media.
2. TEST TAI ANH META -> can Photo ID (anh unpublished).
3. TEST NANO BANANA -> neu 429 thi sua quota Google; upload route van co the OK.
4. DANG TEST THAT NGAY -> PUBLISHED + Post/Media ID moi la bang chung end-to-end.
