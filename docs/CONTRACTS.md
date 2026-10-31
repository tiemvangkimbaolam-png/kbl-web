# Hợp đồng dữ liệu và vận hành

## Bảo mật

Site mặc định riêng tư. API `/api/admin/*` yêu cầu identity do Sites cấp và email khớp OWNER_EMAIL. Mỗi Windows có token 64 ký tự, chỉ hash lưu server; worker phải thêm x-kbl-worker-token. Bản riêng tư còn có OAI-Sites-Authorization cấp từ Sites. Cấu hình tải về chỉ dành cho chủ.

`/api/public/catalog` chỉ công bố sản phẩm đã bật và còn hàng; `/api/public/orders` tự lấy giá từ server, bỏ mọi giá client đưa lên; tư vấn chỉ đọc với x-kbl-chat-token riêng từng cuộc. Không công bố đơn hàng, thông tin khách, token hoặc phiếu POS.

## Worker v2

- POST /api/worker/heartbeat: báo khả năng thật và tình trạng tối đa 20 hồ sơ, gồm `paired` của tiện ích Chrome; nhận settings/accounts/commands. Heartbeat chỉ ghi worker/tài khoản khi trạng thái đổi hoặc tem sống 45 giây; điều phối job chạy ở cron mỗi phút, không chạy lại theo heartbeat.
- POST /api/admin/commands: `pair`, `open-login`, `check-session`, `hide-window`, `resume`. Lệnh `pair` sinh mã `KBL42-…` dùng một lần trong 10 phút; mã chỉ nằm trong lệnh gửi Windows, không nằm trong dữ liệu xuất. Mật khẩu AI không đi qua website.
- POST /api/worker/commands/{id}: worker trả `ok` và `message`; với lệnh `pair`, message chứa mã ghép để chủ đọc trong 10 phút.
- POST /api/worker/claim: accountId hoặc capabilities=['render'], tùy chọn jobId để nhận đúng việc đã chọn.
- POST /api/worker/jobs/{id}/dispatch: phải có lease, ghi nhận đã bàn giao UI/dựng.
- POST /api/worker/jobs/{id}/complete: lease và result. Chỉ chấp nhận cùng kết quả khi gửi lại; hash khác từ chối.
- POST /api/worker/jobs/{id}/failure: notSent=true chỉ khi chứng minh chưa gửi; nếu chưa rõ thì attention và giữ lease.
- POST /api/worker/assets?storyId=...&purpose=...: nhận file thuộc job/lease, hash SHA-256, giới hạn ảnh 12MB và video 20MB.
- GET /api/worker/assets/{hash}?jobId=...: chỉ file đúng bản tin của lease, dùng khi duyệt ảnh/dựng.

TTL 30 phút là thời gian chờ mất heartbeat của lease, không phải hủy hồ sơ tin. Lượt running không tự gửi lại nếu quá thời gian; kết quả đến muộn với lease gốc vẫn có thể đối chiếu. Việc của các tài khoản khác không bị dừng theo.

## POS

POST /api/worker/pos-snapshot với token worker:
```
{ "complete": true, "products": [{ "sku": "...", "name": "...", "category": "nhan", "purity": "999.9", "weight": 0, "price": null, "available": true }] }
```
Tối đa 500 dòng hợp đồng, giới hạn danh mục ứng dụng 500 bản ghi; bản chụp vượt hạn mức bị từ chối trước khi thay đổi dữ liệu. Nhập và đánh dấu thiếu thực hiện trong một batch giao dịch. Không gửi thông tin khách/phiếu cầm. Dòng vắng khỏi bản chụp đầy đủ đánh dấu posMissing/available=false; bản chụp một phần không được dùng đánh dấu thiếu. Không có quyền ghi ngược POS. Schema và ảnh đã được đối chiếu với 6 file POS ngày 26/10/2026; xem POS_SYNC.md. Windows relay đọc JPEG trong product-photos theo SKU, nhận các POST đồng bộ sẵn có của POS, không thực thi module POS.

## Lưu trữ

- Ảnh sản phẩm và ảnh tin đang dùng không thuộc nhóm dọn video.
- Video tạm, audio và phụ đề dựng chỉ xóa khi mọi kênh yêu cầu có external_id và URL biên nhận. File gốc ở Windows.
- Bản tin website hiện công bố bài viết và ảnh. Video tạm trên R2 không phải kho video công khai lâu dài; khi thêm kênh video cần lưu URL bài/video bên nền tảng vào receipt.
- D1 được giới hạn số bản ghi theo loại; không hard-delete lịch sử đơn hàng để giấu đầy ổ. Khi chạm hạn mức, chủ xuất dữ liệu và quyết định lưu trữ.
- Nhật ký tối đa 2000 sự kiện, bộ đếm chống spam một ngày, lệnh đã xong/bị lỗi giữ 7 ngày. Không tự sinh ZIP backup trên hosting.

## Quyền nền tảng

Các kết nối thật, kênh xuất bản công khai, nguồn giá, tiếng nói và quyền tương tác mạng xã hội chưa được xác minh chỉ bằng kiểm thử mô phỏng. Chỉ báo đã đăng khi có biên nhận đúng kênh và kiểm tra trạng thái xử lý/hiển thị theo API của nền tảng.

## Tham khảo thị trường công khai

GET /api/public/market trả XAU/USD từ giavang.org và tỷ giá bán ra USD của VCB khi đọc được nguồn. Trả available=false, số giá null khi không có nguồn/bản lưu hợp lệ; bản lưu cũ có stale=true và giữ fetchedAt gốc. Chỉ quy đổi tham khảo 24K, không dùng thay giá cửa hàng hoặc POS. Không dùng endpoint này làm bằng chứng đã vận hành cảnh báo biến động 50 USD hoặc tự xuất bản tin.


## Khách hàng và dịch vụ ảnh (28/10/2026)

Auth khách là session riêng __Host-kbl_customer; không thay Cloudflare Access của Admin và không tự nối dữ liệu POS chỉ bằng số điện thoại. Session token chỉ lưu hash; mật khẩu không thể đọc lại. Reset cần OTP hoặc staff xác minh và mã một lần. Trưng bày/giá/công thức POS không thay đổi.

Quota thử ảnh là server-authoritative (5 ban đầu, thêm qua Admin sau đối chiếu mua); requestId idempotent và reserve nguyên tử. Ảnh khách cần consent và riêng tư theo customerId; kết quả 7 ngày, đầu vào không lưu bền. Provider chưa rõ kết quả không tự gọi lại hoặc hoàn lượt; staff đối soát trước. Lỗi đã xác nhận không có ảnh được hoàn lượt.

Lịch sử tiệm khóa bản chụp thật mốc 13 giờ theo giờ Việt Nam; không dựng giá lịch sử. Feedback không phải consultation; Telegram có outbox và biên nhận riêng.
