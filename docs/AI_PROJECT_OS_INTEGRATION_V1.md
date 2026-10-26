# KBL AI Office — tích hợp AI_Project_OS với website Cloudflare

Trạng thái: **bản hợp đồng tích hợp để triển khai, chưa phải tính năng đã chạy thật**.
Ngày: 2026-10-26. Nguồn AI_PROJECT_OS người dùng đã gửi: `AI_Project_OS_v0.9.82_FULL_SOURCE (1).zip` (361 MB) và `v0.9.65_RECOVERY_R8_FULL_SOURCE.zip`. Chưa xác nhận cấu trúc code bên trong ZIP ở môi trường kiểm thử; cần đối chiếu trước khi sửa logic của AI_PROJECT_OS.

## Quyết định kiến trúc (giữ nguyên phần đã chạy)

- Cloudflare Worker `kbl-web-moi`: website/admin/API, định kỳ quét giá/market bằng API đã được cấp quyền, lưu metadata/hàng đợi nhỏ trên D1, ảnh cần công khai trên R2. **Không chạy Chrome và FFmpeg ở edge**.
- `AI_PROJECT_OS` trên Windows: văn phòng AI hiện hữu chịu trách nhiệm research/write/review/image/image-review/render, đăng nhập Chrome bằng profile hợp lệ, dựng video và giữ tệp gốc. **Không tạo thêm nhóm Chrome độc lập**.
- Bộ nối Windows (adapter riêng) kết nối **một chiều ra Internet** với `/api/worker/*`; hiện source website có giao thức heartbeat/claim/dispatch/complete/failure/receipts. Adapter phải map schema của AI_PROJECT_OS sau khi kiểm tra ZIP; không thay source chính của AI_PROJECT_OS khi chưa có test.
- POS đang dùng **chỉ đọc**, độc lập; không thay công thức hoặc dữ liệu. Không dùng chung cổng, token, SQLite hay Chrome profile với worker khác.
- Tự động API Market hoạt động khi Windows tắt **nếu** có nguồn/API hợp lệ và ngân sách/công tắc đang bật. AI theo phiên Chrome dừng khi Windows tắt, tiếp tục từ checkpoint khi bật lại.
- Chỉ tự đăng lên kênh được cấp quyền chính thức và có khả năng đăng từ Cloudflare (hoặc đã hẹn giờ hợp lệ trên nền tảng). Nếu chỉ có browser publisher trên Windows, máy tắt đúng giờ thì trạng thái `WAITING_FOR_WINDOWS` — tuyệt đối không giả biên nhận.

## Luồng tác vụ và chống mất dữ liệu

```
SOURCE_FOUND -> RESEARCHING -> DRAFT -> REVIEW_PENDING -> APPROVED
  -> MEDIA_RENDER -> MEDIA_READY -> READY_TO_SCHEDULE
  -> SCHEDULED -> PUBLISHING -> PUBLISHED
                               -> RETRY_WAIT | NEEDS_ATTENTION
```

- Mỗi nội dung có `storyId`, `sourceUrls`, `factCheckedAt`, `reviewerId`, `mediaHashes`, `platforms`; công việc gửi đi phải có lease và biên nhận.
- Mỗi lịch đăng chứa `publishAtUTC`, `timeZone=Asia/Ho_Chi_Minh`, `channel`, `idempotencyKey = SHA256(storyId + channel + publishAtUTC)`, `receipt`. Không coi HTTP 200 chưa có `externalId` / URL bài là đăng thành công.
- Giữ lịch trong D1, sản phẩm hoàn thiện/giọng/video gốc trên Windows. Nếu cần đăng khi Windows tắt, file phục vụ xuất bản phải được đưa lên hệ thống/kênh có thể xử lý độc lập, trong quota và sau phê duyệt.
- Worker nhận việc: POST `/api/worker/heartbeat`, POST `/api/worker/claim`, POST `/api/worker/jobs/{id}/dispatch`, POST `/api/worker/jobs/{id}/complete`, POST `/api/worker/jobs/{id}/failure`.
- Website phải cho phép xem `queued/running/approved/scheduled/published/attention`, nhật ký, nguồn, hash tệp, kênh và trạng thái online Windows. Cho phép chủ dừng toàn bộ xuất bản, sửa lịch, duyệt thủ công.
- Windows giữ outbox SQLite bền vững, ACK theo ID/hash; mất mạng/khởi động lại không gửi trùng, không xóa tệp trước khi mọi kênh xác nhận.

## Lịch tự động

- **Quét Market API:** mỗi giờ một lần bằng Cloudflare Cron (UTC), ít request; nguồn giá vàng tham khảo tách riêng khỏi giá giao dịch POS. Giới hạn số nguồn, độ mới nguồn, retry và ngân sách API.
- **Bản tin giá vàng:** chuẩn bị/đăng ba mốc **07:00, 12:00, 19:00 giờ Việt Nam** = **00:00, 05:00, 12:00 UTC**. Phải nhận giá POS có dấu thời gian phù hợp mới cho phép tạo bản tin.
- **Hàng chờ:** cron kiểm tra lịch đến hạn (ví dụ 5 phút/lần nếu cho phép lệch tối đa 5 phút); nếu yêu cầu chính xác từng phút phải thiết kế chế độ phù hợp quota. Cron chỉ giao lệnh/kiểm tra, không render video.
- Giới hạn bật tự động theo cấp `teamEnabled`, `publicationEnabled`, `platformEnabled`; mặc định OFF. Không đăng nếu review fail hoặc thiếu nguồn.

## Giới hạn hosting / bảo mật

- R2 tổng dung lượng ứng dụng mặc định 256 MB; tránh bật tăng giới hạn Admin vô điều kiện. Không đưa ZIP 361 MB, video gốc, profile Chrome, cookie, `kbl-config.json`, POS database hay token vào R2/GitHub.
- Cloudflare Free có giới hạn Workers, Cron, D1 và R2; phải đo/giảm ghi D1, request lặp, và có cảnh báo trước ngưỡng. Tránh quét web/LLM không giới hạn, không tự mở gói trả phí.
- Access chỉ bảo vệ `/admin*` và `/api/admin*`; worker giao tiếp bằng token tạo riêng cho server mới qua HTTPS. Không tái sử dụng `KBL_SYNC_TOKEN` cũ.
- Tài khoản AI miễn phí có thể gặp hạn mức/đăng nhập lại; không vượt CAPTCHA, không giả đăng nhập hay sử dụng API ngầm trái điều khoản.
- Bình luận/inbox tự động sau khi nền tảng cấp quyền; chỉ trả lời FAQ đơn giản có nguồn. Khiếu nại, tiền, tuổi vàng, lãi cầm đồ, riêng tư khách phải chuyển chủ.

## Những gì source website đã có (đọc trên nhánh kbl-web-moi)

- `worker/cloudflare.ts` hiện chỉ có `fetch()`, **chưa có `scheduled()`**.
- `lib/kbl/pipeline.ts` có `tick()`, job lease, duyệt tách người, publish website; **chưa chứng minh đăng đa kênh theo lịch khi Windows tắt**.
- `lib/kbl/store.ts` có giới hạn bản ghi và `storageLimitMB: 256`; cần kiểm thử thực tế R2/D1.
- `windows/KBL_WINDOWS.cjs` phục vụ local port 39878 và adapter Windows riêng; **chưa nên chạy song song điều khiển cùng profile AI_PROJECT_OS**.

## Thứ tự triển khai (không ảnh hưởng website cũ)

1. Kiểm tra cây source và entrypoint của ZIP v0.9.82: scheduler, queue, publisher, AI Chrome profiles, media output, local database, IPC/API; giữ nguyên module đã dùng được.
2. Tạo `AI_Project_OS ↔ KBL` adapter (không ghi vào POS): map công việc và kết quả, handshake token riêng, heartbeat và outbox; test khởi động lại/mất mạng/không gửi trùng.
3. Thêm state `SCHEDULED` + due-check có transaction/idempotency vào D1, thêm `scheduled()` Cloudflare và Cron tối thiểu, chỉ test trên nhánh thử.
4. Bật API market dưới quota (nguồn thật, cờ staleness), tạo 1 bản tin hoàn chỉnh trên Windows, đẩy vào lịch 07/12/19; kiểm tra 1 kênh được cấp quyền có external ID và URL.
5. Nghiệm thu Windows OFF/ON; sau đó mới mở rộng đa nền tảng, bình luận và tự trả lời.

## Điều kiện nghiệm thu

A. Windows đang bật: AI_PROJECT_OS tạo một bài **đã duyệt + ảnh/video thật** và hàng chờ web thấy đúng 1 bản.
B. Tắt Windows trước giờ: Cloudflare vẫn quét Market; job Chrome không mất; kênh có API đăng đúng hạn, kênh browser-only hiển thị WAITING_FOR_WINDOWS.
C. Bật Windows lại: tiếp tục từ checkpoint, **không đăng trùng**, không tạo lại bản tin cũ.
D. Sai nguồn, token lỗi, vượt quota, thiếu media: chặn đăng, báo lỗi rõ; POS nguyên vẹn.
E. Không bật publicationEnabled thì không có bài đăng tự động.

**Không tự merge nhánh này sang kbl-web-moi; không thay DNS/domain và không chạy build production.**


## Quyết định bổ sung: Chrome-first / tối ưu chi phí (yêu cầu chủ, 26/10/2026)

- **Ưu tiên bắt buộc:** AI_PROJECT_OS dùng các phiên Chrome đã đăng nhập hợp lệ của Gemini / ChatGPT / Claude / DeepSeek / Grok để nghiên cứu, soạn nội dung, kiểm duyệt và tạo ảnh khi dịch vụ/tài khoản hỗ trợ. Đây là đội AI CHÍNH; **không tự ý đổi sang mô hình gọi API trả phí**.
- Cloudflare xử lý UI/API website, lệnh, trạng thái, hàng đợi và hẹn giờ. Không chạy năm Chrome trên Cloudflare Browser Run, không sao chép Chrome profile/cookie lên cloud.
- **API Market riêng, chi phí giới hạn:** nguồn vàng thế giới, tỷ giá, tin RSS/trang chính thức có quyền sử dụng; chỉ gọi AI API nếu chủ bật riêng + có khóa/quota/budget. Mặc định không dùng LLM trả phí. Cron có giới hạn và cache nguồn.
- **Chuyển việc theo năng lực thật:** không giả định mỗi dịch vụ có thể tạo ảnh; nếu tài khoản hết lượt hoặc vướng đăng nhập, đưa job vào `NEEDS_ATTENTION` hoặc thử tài khoản khác đã được cấp quyền cho công việc đó; không vòng lặp vô hạn hoặc vượt CAPTCHA.
- **Hai hàng đợi độc lập:** `CONTENT_PRODUCTION` cho AI Chrome Windows (chạy khi máy bật) và `PUBLISH_SCHEDULE` cho bài đã duyệt (website/cloud). Mất điện mạng không mất checkpoint; bài chỉ có thể đăng khi Windows tắt nếu đã có tệp đủ điều kiện trên cloud/kênh và API/đặt lịch hợp lệ, nếu không `WAITING_FOR_WINDOWS`.
- **Mục tiêu người vận hành:** chỉ cần mở Windows để AI làm ra nhiều sản phẩm đã duyệt theo quota/ngày, tự điền vào lịch đăng 07:00/12:00/19:00 (không spam nhiều bài cùng lúc). Việc được nhận và kết thúc có `jobId`, `sourceUrls`, `mediaHash`, `reviewReceipt`; publication có `idempotencyKey`.
- Chrome miễn phí có giới hạn lượt và điều kiện sử dụng từng nhà cung cấp; không được khẳng định miễn phí tuyệt đối hoặc tự động chạy 24/7. Cần kiểm tra quyền tự động hóa từng ứng dụng, không vượt bảo vệ đăng nhập/hạn mức.
- Bản tích hợp phải **tận dụng engine, queue, UI và tiện ích** từ AI_Project_OS v0.9.82 sau khi đọc đủ source, thay vì dựng một bộ Chrome Worker trùng chức năng. Không dùng hoặc sửa source POS.
- **Điều kiện nghiệm thu thêm:** bật Windows: đội Chrome hoàn thành một bản tin thật → chờ lịch; tắt Windows: Market API vẫn chạy, job Chrome giữ; bật lại: không đăng trùng. Khi tài khoản Chrome gặp CAPTCHA/hết hạn mức: dừng đúng việc, hiển thị lý do, không hứa đã hoàn thành.
- Mọi thay đổi kỹ thuật sẽ vào nhánh tích hợp trước để review; nhánh Cloudflare production `kbl-web-moi` và `main` giữ nguyên đến khi nghiệm thu.
