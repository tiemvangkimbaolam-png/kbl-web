# Ảnh bảng giá và video đọc giá — 03/11/2026

Yêu cầu chốt: bảng giá dựng từ mẫu local có sẵn, số điện thoại, snapshot giá và ngày giờ cố định. YouTube/TikTok dùng video có lời đọc; Facebook/Instagram/Threads/Telegram dùng ảnh kèm caption/hashtag riêng. Không đổi công thức POS. Không thay luồng sản phẩm hoặc tin thị trường.

## Thay đổi

- Mỗi bản giá mới lưu `publicationPolicy=gold-platform-v1` và đúng một định dạng theo kênh. Các hồ sơ cũ, tài khoản nhận, outbox và biên nhận đã chốt được giữ nguyên.
- Ảnh bảng giá đầu tiên đã được local validator đối soát có thể đăng trước khi TTS/video hoàn thành. Ảnh và nội dung băm giữ nguyên khi video hoàn thành, kể cả lúc Facebook còn đang tải ảnh. Video vẫn dựng trong cùng lượt; giữ FIFO đến khi công việc và biên nhận hoàn tất.
- Không bỏ yêu cầu video của YouTube/TikTok khi video chưa sẵn sàng. Caption/hashtag TikTok được gửi vào đúng trường caption, thay vì chỉ tiêu đề.
- Sửa `redirect:error` trong đổi mã OAuth/đọc tài khoản, Telegram và bộ gửi bài/upload thành `manual`, từ chối mọi phản hồi chuyển hướng. Cloudflare Workers không hỗ trợ `error`, do đó trước đây có thể lỗi ngay trước khi gửi yêu cầu. Không cho khóa đi theo Location. Thêm nhật ký lỗi callback đã lược bỏ nội dung nhạy cảm.
- Admin mô tả đúng định dạng bảng giá và báo rõ khi chưa chọn tài khoản nhận bài. Không tự bật hoặc chọn các kênh chưa được cấp quyền.

## Bằng chứng thực tế và giới hạn

- Worker đang chạy tại `D:/KBL/LocalWorker`, Cloudflare queue trả HTTP200. Trước khi sửa, cấu hình thực tế chỉ chọn website; Facebook/Instagram/Threads mới có ứng dụng, không có tài khoản nhận bài. YouTube/TikTok/Zalo còn thiếu cấu hình ứng dụng.
- Lượt thật `a7eff122222aa711d4fc6dbea81d0ede` đã dựng ảnh có điện thoại 0899 979 797, chốt 14:51:40 ngày03/11/2026, video H264 1080x1920 dài42giây với audioAAC24kHz và giọng Hoài My; có biên nhận website `/tin-tuc/a7eff122222aa711d4fc6dbea81d0ede`. Đây là dữ liệu lịch sử đã chốt, không phải giá hiện tại hay bằng chứng đã đăng mạng xã hội.
- Chủ hoàn tất lượt Facebook đầu tiên nhưng callback trả `social=failed`; chưa lưu kết nối. Đã xác định và sửa transport không tương thích Workers. Cần đối soát lượt OAuth mới sau triển khai, không phát lại mã một lần đã dùng.
- Zalo giữ chế độ cần quyền OA/phát hành riêng; không tự bật hoặc giả biên nhận. Chưa có bằng chứng đăng thành công lên YouTube/TikTok hoặc các mạng xã hội cho đến khi có kết nối và biên nhận thật.

## Kiểm tra

- Kiểm thử database SQLite, pipeline và giả lập provider: ảnh đăng trong khi video đang chờ; cùng snapshot và giờ chốt; caption/hashtag; chọn đúng định dạng; giữ yêu cầu video; ảnh Facebook dở dang giữ fingerprint qua lúc render xong; legacy plan và kết quả chưa rõ không bị gửi lại; OAuth/token không bị chuyển hướng.
- Bộ dựng FFmpeg thật chạy trên dữ liệu fixture để kiểm tra khung ảnh, QR, điện thoại, audio và cache. Phân biệt với biên nhận dữ liệu thật nêu trên.
- Website typecheck dùng cấu hình tạm loại project Remotion riêng, không đổi tsconfig nguồn. Full typecheck còn lỗi có sẵn ở khai báo generic `windows/remotion/src/Root.tsx` với phiên bản thư viện cục bộ; không thay renderer đang dùng.

Nguồn kỹ thuật: [Cloudflare Request redirect modes](https://developers.cloudflare.com/workers/runtime-apis/request/), [TikTok video caption](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post).

Kết quả cuối trước triển khai: 351/351 kiểm thử đạt, không bỏ qua; website typecheck và build Cloudflare thành công.

Sau triển khai54b8e90: Cloudflare production báo success08:22:42Z. OAuth Facebook thật đã lưu tài khoản; chủ đã cấp quyền trước đó, tiếp tục cùng cài đặt. Chọn đúng Page Tiệm Vàng Kim Bảo Lâm và bật Nhận bản tin mới; worker API đã đọc được publicationConnections.facebook. Không bật inbox hoặc các kênh khác.

Bổ sung lượt đầu khi có kênh nhận mới: dùng snapshot POS mới hợp lệ ngay cả khi các giá trị chưa đổi; không sửa hồ sơ cũ, không đổi lịch08:00/13:00/19:00. Chỉ một bản được tạo nguyên tử, chờ đủ biên nhận trước lượt tiếp. Bỏ chọn kênh không sinh bài giống nhau.352/352 kiểm thử, website typecheck và build Cloudflare đều đạt.
