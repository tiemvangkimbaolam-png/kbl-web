# Khôi phục giá server BK/ASK

Nguồn đối chiếu: app.js cũ commit 6f68320ad2af03893509497011fc9dbcc2e18ad6: GOLD_RULES391, normalizePrices668, effectiveCloudPriceConfig7606, pollCloudPrice7781. Luồng cũ tự lấy Google Relay khi POS/PC tắt. Không thay bằng XAU/USD thế giới.

Đang khôi phục: server module đọc Relay có bounds/timeout/redirectallowlist, công thức legacy, guard35%, snapshotD1 riêng, token mã hóa. Windows chỉ đọc settings POS để bàn giao allowlist cấu hình/chênh lệch một lần qua mã worker; privateconfig không vào public/export. Không ghi ngược POS. Cron1phút và publiccatalog ưu tiên cloudsnapshot nếu có, giữ giá có thời điểm khi nguồn lỗi. Các job AI/video vẫn cần Windows.

Bản WIP nằm nhánh kbl-cloud-price-recovery, chưa được coi là deploy hoặc luồng giá thật đã chạy. Khi đủ module/tests, chạy toàn bộ test/TypeScript/build/dryrun rồi đưa sang kbl-web-moi. Không đưa khóa vào source/chat. KBL_PRICE_ENCRYPTION_KEY hoặc KBL_SOCIAL_ENCRYPTION_KEY cần có ở Worker; nếu thiếu, giữ configoutboxWindows để bàn giao lại sau khi owner thêm Secret.
