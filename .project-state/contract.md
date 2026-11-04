# KBL — mẫu 06 đã chọn

Nguồn: branch kbl-web-moi, base 7254c6e388d591c54481a9fd711ff0b0eaf7e47c.
Tham chiếu được duyệt: image-edit-target-a521aed9885ffa3e.png, mẫu 06 Hồng đào vàng đồng.

- Nền trắng, hồng đào rất nhạt; chữ xanh đậm; thương hiệu và giá bán màu đồng, nét viền mảnh, chữ lớn.
- Website giữ sản phẩm, tìm kiếm, giỏ hàng, thử trang sức, lịch sử giá, AI, ngôn ngữ và chuyển đổi hiển thị tiền tệ.
- Nút cài widget miễn phí dẫn tới hướng dẫn Scriptable, hỗ trợ nhỏ/vừa/lớn. Lấy giá công khai của chính KBL; không hard-code giá minh họa, không đổi công thức hay giá cộng của POS.
- Làm mới dưới logo AI; mũi tên về đầu trang.
- Kiểm tra parser, lỗi mạng/cache, thực thi Scriptable bằng mock API; build Cloudflare; trình duyệt 320/375/414/768/desktop. iPhone/Scriptable thật chưa có thiết bị kiểm tra.
- Bàn giao GitHub branch/PR và gói cập nhật gọn nếu cần. Không đổi DNS, migrations, dữ liệu hay công khai secrets.

SHA256 ảnh mẫu đã chọn: 4023986244cb2bf058a8aa814c30e6c47d77f977f67084065a8fa642946cb601.

01/11/2026: người dùng cung cấp ảnh lỗi UTI lúc chia sẻ gói Scriptable. Được phép sửa luồng cài, giữ mẫu 06 và giá/POS. Thay bằng sao chép mã → editor mới, thêm fallback thủ công, kiểm tra hash mã, và cung cấp đoạn cài ngắn gắn commit cố định cho trường hợp cứu hộ. Không khẳng định đã kiểm tra iPhone thật hoặc đã deploy khi chưa có bằng chứng.

Căn bảng giá mobile: khoảng hở 12px của grid cũ cộng thêm trên tổng 100% bề rộng ba cột đẩy giá bán vượt mép phải. Bỏ khoảng hở thừa và chừa thêm 6px bên phải ở cả tiêu đề/các dòng; không đổi giá, cỡ chữ hay công thức. Kiểm tra mép chữ thay vì chỉ bề rộng khung.

01/11/2026 — Vàng của tôi: người dùng cho phép làm trước bảng theo dõi vàng sở hữu riêng theo tài khoản, giao dịch mua/bán tự nhập, lãi/lỗ VND và % theo giá mua vào, mũi tên và đồ thị từ mốc giá thật; widget Scriptable riêng nhỏ/vừa/lớn, ghép một lần và thu hồi được. Giữ mẫu 06, chữ dễ đọc và widget bảng giá hiện có. Không nối/ghi dữ liệu POS, không sinh giá hay đường tăng giả. Dùng records hiện có, không sửa migration/schema. Mã widget chỉ đọc tóm tắt, token trong Keychain, không đưa token vào URL/log. Không hứa chạy khi người dùng đi ngủ; hoàn tất trong lượt hoạt động và báo rõ phần chưa kiểm tra thiết bị/deploy.


02/11/2026 — yêu cầu hiện tại: ưu tiên mẫu ảnh/video local worker cho sản phẩm và bảng giá vàng, tông trắng ngà/hồng đào/đồng giống bảng giá live. Sau đó sửa giao diện POS chỉ bằng CSS và nối các luồng chưa ổn sang Cloudflare. Tuyệt đối không sửa công thức, logic bán hàng/bù trừ/hóa đơn/cầm đồ, dữ liệu hoặc giá POS. Giữ các luồng đang hoạt động; giá mới không hủy edition/lease/receipt đang làm. Không xóa bộ cũ.
Mẫu phải dựng bằng mã, ảnh sản phẩm gốc và snapshot đã chốt; không dùng AI vẽ số hoặc hàng thật. Bản preview không tự đăng.

02/11/2026 — chủ tiệm yêu cầu làm gọn POS theo bảy ảnh: thay các thanh nhảy mục bằng một nút lên đầu trang ở góc phải; đưa hướng dẫn/ghép hồ sơ xuống dưới mục 4–5; bỏ tiêu đề và giải thích giao diện thừa; gom thanh tìm kiếm/in tem với bộ lọc kho, đưa cấu hình máy in xuống dưới kho. Giữ mọi chức năng, công thức, trạng thái và dữ liệu đã chốt. Cho phép tăng khoảng ký giữa Bảng kê thu mua và Giấy đề nghị bán vàng; phần bổ sung trình bày tách khỏi mã nghiệp vụ.

02/11/2026 — ngoại lệ mới được chủ tiệm cho phép: chỉ thay chính sách lãi/phí cầm đồ theo tiền gốc, giữ LS 1,5%/30 ngày; gốc <=100 triệu tổng 3%, >100 triệu tổng 2,5%. PTĐ/PĐQ/CPBG lần lượt 0,5/0,5/0,5% hoặc 0,4/0,3/0,3%. Tính cả ngày nhận cầm; đúng 100 triệu thuộc mức 3%. Không sửa tiền/lịch sử đã chốt, không sửa bán hàng/đổi bù/vốn/giá sản phẩm. Đội AI nhận việc linh hoạt theo khả năng sẵn có, hoàn tất và nhận biên nhận đăng bản tin trước rồi mới xử lý bản tin giá kế tiếp; giữ snapshot đang làm. Giữ và kiểm tra luồng tin/nhận định các yếu tố tác động giá vàng có nguồn thật. Không hủy hoặc gửi lại việc đang chạy chưa rõ kết quả.
02/11/2026 — TV: chủ tiệm yêu cầu tăng chữ bảng giá TV và kéo từng ô giá/tiêu đề độc lập, giãn cột mua/bán. Được sửa và lưu mẫu trình bày TV hiện tại; giữ tên/địa chỉ/màu/lớp, giá và mọi công thức/đồng bộ/luồng AI. Mẫu cũ phải đọc được, có hoàn tác và chống ghi đè phiên bản.

02/11/2026 — tiếp tục: sửa dòng LS/phí còn cũ ở liên 2 do mẫu in đã lưu và dàn lại hai chế độ đổi vàng theo ảnh của chủ: CCCD, giỏ/giá/khách/thanh toán, tìm sản phẩm; khối nhập vàng cũ sang phải dưới xem trước hóa đơn. Chỉ trình bày, giữ mọi điều khiển/công thức/dữ liệu. Chủ xác nhận lượt duyệt ChatGPT chưa gửi và cảnh ảnh thứ hai Gemini Bủn chưa gửi; được tiếp tục đúng bước, giữ ảnh thứ nhất và mã lượt. Chờ chủ thoát POS bình thường để thay gói bị khóa, và tải lại tiện ích đã cài mà không đóng chat/mất ghép. Không tự gửi lại việc chưa rõ kết quả.

02/11/2026 tối — chủ nhắc bảng giá dùng mẫu local đã tạo, không cần AI tạo ảnh. Sửa điều phối để luồng giá vàng không bị tin tức đang chờ ảnh chặn; mỗi luồng vẫn tuần tự đến đủ biên nhận rồi mới sang bản kế, giữ giá đã chốt và mọi việc đang chạy. Không bỏ duyệt, không thay giá/công thức/dữ liệu POS hoặc tạo bài thử trên production. Admin phải phân biệt rõ dựng bảng giá local với tạo ảnh minh họa tin tức.

03/11/2026 — chủ chốt rõ: giá vàng/sản phẩm chỉ điền mẫu có sẵn bằng số liệu và thời gian, tạo caption/hashtag theo nền tảng, dựng bằng local worker; không giao biên tập/duyệt/tạo ảnh cho đội AI. Kiểm tra dữ liệu/file tự động phải ghi đúng là local, không giả lượt duyệt AI. Đội AI chỉ làm tin thị trường; tư vấn mới dùng API Groq/Gemini, lỗi API giữ câu hỏi riêng, không chuyển Chrome. Giữ lượt cũ chưa rõ kết quả, giá đã chốt và tất cả công thức/dữ liệu POS. Bổ sung số điện thoại 0899 979 797 đã đối chiếu website vào chân hai mẫu, giữ bố cục. Không tự thêm kênh đăng hoặc bật quyền xuất bản đang tắt.


03/11/2026 — Owner clarifies gold distribution: YouTube/TikTok narrated local video; every other supported selected social channel uses local price image with per-platform caption/hashtags. Publish validated gold images without waiting on TTS. Freeze prior plans/outbox/receipts. Repair Cloudflare OAuth/publishing transport; owner grants social authorization directly. POS formulas/data are protected.

03/11/2026 — Owner reports CCCD API extraction taking ten minutes. Authorized targeted OCR repair and confirmed normal POS exit for installation. Dedicated direct Gemini transport only for identity OCR; bound waiting, reduce upload copies, retain manual QR and all original images/business functions/data. Do not change invoice OCR, sale/exchange/pawn calculations, saved transactions or worker publication. Generic nonpersonal image timing is not evidence of real customer-card accuracy or latency.

03/11/2026 — Owner requests fast accurate administrative old-to-new address conversion after CCCD upload. Use official data and deterministic local lookup, retain the original residence text/image for comparison, never infer a split boundary from a ward name. Apply unique whole-unit matches; incomplete, split, conflicting or stale cases require human confirmation. Preserve house/street prefix, all calculation functions and historical records. Owner asks to continue; installation is authorized when POS is closed normally. Do not force-close the application or send customer addresses to another lookup service.

03/11/2026 night — Owner reports VNeID QR failure, identity OCR deadlines too short and no retry after remote images arrive. Authorized targeted recovery of identity capture/read only: retain images, explicit retry/cancel, bounded longer provider waits and local QR decoder. Preserve all financial functions, existing records, official local address conversion and worker publication. No guessing encrypted/dynamic VNeID tokens; real-phone/customer-card checks remain separate from synthetic fixtures.

04/11/2026 — Owner requests compact retry buttons beside QR VNeID in tabs1,2,4. Presentation only; preserve OCR/session callbacks, calculations and records. Public GitHub push still awaits explicit authorization from prior turn.

04/11/2026 — Chủ tiệm yêu cầu rà toàn bộ nhãn hàm lượng vàng 9999 và đổi cách hiển thị/in thành 999.9, đặc biệt ô Tên hàng hóa của Bảng kê thu mua. Giữ mã nội bộ 9999, khóa bảng giá, giá trị ô chọn, công thức và dữ liệu đã lưu; không thay thế toàn cục trong hồ sơ hoặc mã sản phẩm. Cài khi POS đã thoát bình thường, không ép đóng.
