# Bổ sung vận hành 28/10/2026

## Đã triển khai trong source

- Admin sản phẩm dạng thẻ ảnh, tìm SKU/tên/tuổi, mở chi tiết, bật/tắt trưng bày. Chỉ thay lựa chọn website `websitePublished`; nhập POS tiếp theo giữ lựa chọn này. Hàng mất khỏi POS không được tự hiện là còn hàng. Giữ ảnh đã xuất bản trong bài dù sản phẩm ngừng trưng bày.
- OAuth dùng adapter chính thức hiện có; Admin hiện từng biến cấu hình còn thiếu, callback đúng `/api/admin/social/oauth/{platform}/callback`, scopes và hạn chế. Không nhập mật khẩu mạng xã hội vào KBL. Các provider có App/Client riêng; không dùng API key Gemini thay OAuth.
- FIFO: bản tin đang working/waiting-revision giữ thứ tự nhận đến khi xuất bản. Tin đến sau lưu trong hàng đợi; tư vấn chạy riêng. Không hủy do tin mới hoặc tự hết giờ; lease vẫn 30 phút để phát hiện mất phiên, không phải hạn dùng bản tin. Nguồn/duyệt thất bại vẫn phải xử lý thật, không bypass để đăng.
- Lịch giá vẫn 07/12/19 giờ Việt Nam; chốt nguồn và thời điểm, giữ edition đã nhận qua các giờ. Không bịa giá cho slot bị bỏ lỡ.
- Lịch sản phẩm POS mặc định 10/16 giờ Việt Nam, mặc định tắt, bật ở Admin sản phẩm. Settings hỗ trợ `productHours` (0-23, tối đa 6 giờ). Mỗi slot chốt một sản phẩm còn hàng, snapshot kho trong 5 phút, tối thiểu hai ảnh gốc đã có asset receipt. Dùng ảnh gốc, không giao mô hình vẽ lại hàng thật. Qua viết, duyệt, duyệt ảnh, render và publisher chung. Recheck còn hàng trước đăng. Không có đủ ảnh thì chờ, không dùng ảnh giả.
- Tin tự tìm theo giờ khi bật đội và autoResearch: giao AI quét nguồn trong nước và quốc tế (Mỹ, châu Âu, Trung Đông, Ấn Độ, Trung Quốc, Nhật) về vàng/USD/Fed/lạm phát/năng lượng/chính sách; danh sách nguồn cho phép nằm trong lib/kbl/domain.mjs. Source verifier lưu nội dung/URL/hash; hai ảnh minh họa cần qua duyệt thật; Windows dựng video/giọng/phụ đề. Không có phiên AI sẵn sàng thì chưa thể tự hoàn thành.
- Nhận định trước phiên 06:30 và 18:30 hằng ngày khi bật autoOutlook: 2–3 kịch bản tăng/giảm/đi ngang dựa trên số liệu đã xác minh và lịch sự kiện 24–48 giờ tới; bắt buộc câu miễn trừ "không phải khuyến nghị đầu tư", duyệt độc lập như tin thường. Video dựng từ 2 ảnh đã duyệt, không cần quay footage.
- Cron có thể dùng Groq/Gemini trả lời câu hỏi đang chờ, gồm inbox đã được bật hợp lệ. Khóa lượt và tránh job đang được Chrome thực hiện. Webhook/reply chỉ có adapter Facebook/Instagram/Telegram hiện tại. Bình luận YouTube/Threads/TikTok/Zalo và các mục còn thiếu không được coi là đã có tính năng.
- SEO: robots, sitemap sản phẩm/bài công khai; Product JSON-LD trên trang sản phẩm; llms.txt mô tả nguồn công khai. Không tự bịa đánh giá, xuất xứ hoặc cam kết thứ hạng SEO/GEO.

## Chủ cần cấu hình bên ngoài

1. Cloudflare Secret `KBL_SOCIAL_ENCRYPTION_KEY` đúng 64 hex; giữ nguyên nếu đã có dữ liệu mã hóa. Mỗi provider cần các biến liệt kê trong Admin; Meta cần `KBL_META_GRAPH_VERSION` khớp app.
2. Khai báo callback trong dashboard nhà cung cấp; bảo đảm Admin đang ở `KBL_PUBLISHER_PUBLIC_BASE_URL`, Access bảo vệ cả UI/API đúng hostname.
3. OAuth, chọn Page/kênh, chọn “Nhận bản tin mới”. Xin quyền đăng và inbox riêng; một ID tài khoản chưa đủ để đăng.
4. Chạy Windows/Chrome đúng profile, ghép tiện ích, xác nhận heartbeat; FFmpeg/ffprobe/TTS đủ điều kiện.
5. Kiểm tra một edition đủ chặng, từng receipt/URL và visibility. Chỉ bật publicationEnabled sau khi xác nhận nội dung, media và các đích. TikTok vẫn cần preview/privacy/consent và điều kiện app; không hứa unattended public posting.

## Chưa nghiệm thu

Chưa có bằng chứng provider thật OAuth, tạo hình, dựng và đăng một tin hoàn chỉnh trong lần sửa này. App ID/Secret/quyền duyệt không thể sinh từ source. Chưa triển khai tự trả lời bình luận mọi nền tảng hoặc agent tự sửa website để tăng trưởng. Những yêu cầu này cần adapter, quyền tương ứng và nghiệm thu riêng.

## Điều chỉnh theo ý chủ tiệm: chọn vị trí và lưu App trong Admin

Mỗi sản phẩm có các lựa chọn: Nổi bật, Nhẫn, Dây, Mặt dây, Bông tai, Lắc tay, Vòng, Sản phẩm 999.9 / 980. Mặc định không tự đưa toàn bộ kho vào Nổi bật. Tất cả là hợp các sản phẩm đã được xếp vị trí, không phải toàn bộ danh sách POS. Lựa chọn lưu tại `displaySections` và tồn tại qua snapshot POS. Không sửa loại sản phẩm, trọng lượng hoặc công thức POS. Hàng không còn sẵn vẫn bị loại khỏi trưng bày.

Các form App/Client ID và Secret có trong Admin, thay cho hướng dẫn bắt người dùng vào Cloudflare cho từng ứng dụng. Bí mật mã hóa trên server, có thể dùng khóa giá hiện có làm khóa chủ khi chưa có khóa social riêng. Việc lưu ứng dụng vẫn khác với OAuth và xác minh một bài đăng thật. Xem SOCIAL_CONNECTIONS.md.
