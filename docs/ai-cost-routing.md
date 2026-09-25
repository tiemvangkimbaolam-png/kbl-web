# KBL Admin: AI và chi phí

Áp dụng khi mã này được đưa lên hosting. Chỉ đặt key trong biến môi trường của máy chủ; không chèn vào HTML, GitHub hoặc ảnh chụp.

| Chức năng | Mặc định sau thay đổi | Cách dùng hạn mức Free |
| --- | --- | --- |
| AI xem/nghe video, quét SKU và mốc card, phụ đề, Sales Studio | `gemini-2.5-flash`; video cùng project với `KBL_GEMINI_API_KEY`, có thể tính phí token | Đặt `KBL_GEMINI_VIDEO_API_KEY` từ dự án Free riêng. Upload bằng cùng key dùng để đọc video; hết quota thì dừng, không tự đổi sang key trả phí. Quét lại video + catalog y hệt dùng cache 21 ngày. |
| AI Market quét Việt Nam và thế giới | `gemini-2.5-flash`, mặc định quét nhanh mỗi 60 phút, quét sâu mỗi 180 phút; dùng project mặc định nếu không có key riêng | Đặt `KBL_GEMINI_RESEARCH_API_KEY` từ dự án Free. Google Search grounding của 2.5 Flash có hạn mức miễn phí; hết hạn mức sẽ không dựng tin thiếu nguồn. `autoMarket` của Growth không tắt scheduler Market độc lập; muốn dừng tất cả đặt `KBL_AI_MASTER_ENABLED=0`. |
| Tạo JSON chiến dịch/caption, tư vấn, nhìn ảnh, vision QA, embeddings | Key hiện tại; riêng pipeline JSON dùng key riêng khi có | Đặt `KBL_GEMINI_TEXT_API_KEY` từ dự án Free; các lệnh text/vision dùng `gemini-2.5-flash`, embedding giữ model embedding. Khi có key riêng, DeepSeek/OpenAI fallback tự động bị tắt; chỉ mở lại nếu chủ tiệm chủ động đặt `KBL_ALLOW_PAID_TEXT_FALLBACK=1`. |
| Bài ảnh tự động 3 sản phẩm | Mặc định dùng ảnh sản phẩm nguyên bản, ghép giá/QR cục bộ; không sinh ảnh AI và không gọi AI review hình | Muốn ảnh sinh bằng AI và review như trước: `KBL_GROWTH_POSTER_SOURCE=ai`. Lượt tạo ảnh này có thể tính phí; cổng kiểm tra giá, ảnh, QR, URL vẫn bắt buộc. |
| Thử đồ, Photo Studio, minh họa AI, poster tạo bằng Gemini, Veo | Vẫn dùng project có billing khi có lệnh gọi; Veo không tự bật trong Growth (`autoVideos=false`) | Có thể tắt riêng tính năng không dùng. Không dùng key Free cho model tạo ảnh/Veo vì các model này không có Free tier. |
| DeepSeek Prompt Director và OpenAI dự phòng ngoài JSON | Có thể tính phí token khi chủ tiệm sử dụng hoặc bật fallback | Kiểm tra tính năng và key riêng. Key đã cấu hình không chứng minh dịch vụ là miễn phí. |

**Thiết lập khuyến nghị:** tạo hoặc chọn **một dự án Google AI Studio thực sự hiển thị plan Free**, chưa liên kết billing; tạo key trong dự án đó và đặt cùng giá trị cho `KBL_GEMINI_VIDEO_API_KEY`, `KBL_GEMINI_RESEARCH_API_KEY`, `KBL_GEMINI_TEXT_API_KEY` trên hosting. Key thứ hai trong **cùng dự án Paid** vẫn bị tính theo Paid tier. Giữ `KBL_GEMINI_API_KEY` hiện tại chỉ cho các thao tác tạo ảnh/Veo có chủ đích. Khởi động lại Node và xem `GET /api/admin/ai-api/status` sau đăng nhập. Trường `dedicatedKey` chỉ cho biết key khác key mặc định; cần tự kiểm tra plan Free trong Google AI Studio. Có thể đặt `KBL_GROWTH_POSTER_SOURCE=ai` để khôi phục phong cách ảnh AI, và đặt `KBL_AI_MASTER_QUICK_MS` / `KBL_AI_MASTER_DEEP_MS` để chỉnh chu kỳ quét.

Các card giá giữ snapshot từ dữ liệu sản phẩm/giá của job, vẫn yêu cầu chủ tiệm xác nhận timecode trước render. Nếu quota video hết, dùng luồng card thủ công với SKU và mốc thời gian thật; không suy đoán giá hoặc mốc. Sau khi đưa mã lên máy chủ, cần thử bằng một video thật, kiểm tra card và log provider, rồi xem bài đã đăng trên từng nền tảng qua trạng thái connector trước khi kết luận toàn bộ tự động hóa chạy tốt.

Tham khảo: [bảng giá Gemini](https://ai.google.dev/gemini-api/docs/pricing), [giới hạn theo project](https://ai.google.dev/gemini-api/docs/rate-limits), [Files API](https://ai.google.dev/gemini-api/docs/files).
