# Đưa KBL mới lên Cloudflare của ông

Gói này đã thêm cấu hình cho Cloudflare trực tiếp. Không dùng Edit code để dán toàn bộ ZIP. Không chép vào Plesk/Tenten. Không đè Worker `kbl-backup` hoặc database cũ.

Hai cách triển khai: bấm hai file CMD trên Windows (dễ nhất cho lần đầu), hoặc nối GitHub ở cuối hướng dẫn. Source là một, Windows AI worker nằm trong windows/ và không chạy trên Cloudflare.

## 1. Cài công cụ và đăng nhập

Giải nén ZIP, vào thư mục **KBL_WEB_MOI** có package.json.

Bấm **CLOUDFLARE_1_CAI_VA_DANG_NHAP.cmd**. Cần Node.js 24 có sẵn. Công cụ cài trên ổ Windows, không tốn ổ Tenten. Trình duyệt mở yêu cầu đăng nhập/cho phép Wrangler trong chính tài khoản Cloudflare của ông; không gửi token hay mật khẩu cho người khác.

## 2. Tạo các tài nguyên mới trên Cloudflare

| Chỗ bấm | Tạo tên | Lưu ý |
|---|---|---|
| Workers & Pages → Create application → Create Worker/Hello World | kbl-web-moi | Worker thử mới. Lấy URL workers.dev mà Cloudflare cấp; chưa gắn miền chính |
| Storage & databases → D1 → Create database | kbl-web-moi-db | Copy Database ID của database mới |
| Storage & databases → R2 → Create bucket | kbl-web-moi-media | Bucket riêng tư, không bật Public access |

R2 có thể yêu cầu kích hoạt trong tài khoản. Nếu Cloudflare yêu cầu xác nhận thanh toán/gói, ông quyết định tại đó; các script không đổi gói, không tự bật dịch vụ trả phí.

Mở **wrangler.cloudflare.json** bằng Notepad, thay database_id đang là 00000000-0000-4000-8000-000000000000 bằng Database ID vừa copy. Không lấy ID kbl-backup-db cũ.

## 3. Bảo vệ Admin bằng Cloudflare Access

Source trực tiếp kiểm tra chữ ký JWT Cloudflare Access; không tin email/header do người ngoài tự gửi. Khi chưa cấu hình đúng thì Admin bị khóa, trang bán hàng vẫn có thể mở.

Cloudflare → **Zero Trust → Access controls → Applications → Add/Create application → Self-hosted**.

Đặt tên KBL Admin mới. Dùng **một ứng dụng** có hai public hostname/path trên URL Worker mới vừa lấy:

| Hostname | Path |
|---|---|
| Host kbl-web-moi...workers.dev thực tế Cloudflare cấp | /admin* |
| Cùng hostname đó | /api/admin* |

Tạo policy **Allow → Include → Emails → vlam1881997@gmail.com** (hoặc email chủ thực tế). Không chọn Everyone. Có thể dùng phương thức đăng nhập email OTP của Access; không yêu cầu tài khoản Codex. Nếu bật Google trong Access thì đăng nhập Google qua Access.

Để **Cookie Path Attribute tắt**, cho cookie hoạt động với API/ảnh riêng cùng hostname. Không bảo vệ toàn bộ Worker hoặc toàn bộ /api/*, vì trang công khai và kết nối Windows không dùng phiên đăng nhập chủ.

Từ Cloudflare Access copy:

- Team domain: dạng https://ten-team.cloudflareaccess.com.
- Application Audience (AUD) Tag: phần Additional settings của chính ứng dụng vừa tạo.

Điền vào **wrangler.cloudflare.json**:

```json
"vars": {
  "KBL_AUTH_MODE": "cloudflare-access",
  "KBL_ADMIN_ORIGIN": "https://kbl-web-moi.ten-mien.workers.dev",
  "OWNER_EMAIL": "vlam1881997@gmail.com",
  "CF_ACCESS_TEAM_DOMAIN": "https://ten-team.cloudflareaccess.com",
  "CF_ACCESS_AUD": "AUD_TAG_64_KY_TU_CUA_UNG_DUNG"
}
```

Team domain/AUD/Database ID không phải mật khẩu; cấu hình được phép lưu cùng source. Token phiên, API token Cloudflare và kbl-config.json của Windows không được upload GitHub. Không đổi OWNER_EMAIL sang email không phải của chủ.

## 4. Đưa source lên Worker thử

Bấm **CLOUDFLARE_2_TRIEN_KHAI.cmd**. Script kiểm tra cấu hình, build, áp dụng migration vào D1 mới và deploy lên kbl-web-moi. Dừng khi lỗi; không báo deploy thành công nếu lệnh thất bại. Script không đổi DNS, không thao tác kbl-backup, không sinh ZIP backup trên hosting.

Mở URL workers.dev vừa in để kiểm tra:

1. Trang chủ mở; /api/health trả database/files true.
2. /admin chuyển qua Cloudflare Access; email chủ vào được, người khác không vào được.
3. Admin → Kết nối → tạo/tải cấu hình Windows riêng cho website mới; không tái dùng file config bản Sites. Chạy windows/BAT_DAU.cmd trên máy POS và làm theo docs/POS_SYNC.md để nhận giá/kho/ảnh/phiếu.
4. Kiểm tra một sản phẩm và QR phiếu. Chưa có dữ liệu sync thì web trống thật, không tự nhập dữ liệu thử.

Nếu Admin trả thông báo chưa cấu hình Access, kiểm tra 3 giá trị vars và policy/hostname của Access. Chưa được thì không chuyển miền. QR khách không cần đăng nhập chủ, chỉ dùng token riêng POS cấp.

## 5. Cuối cùng chuyển tên miền đang có

Chỉ sau khi Worker thử được kiểm tra: gỡ/chuyển route cũ của kbl-backup cho đúng hostname; thêm miền vào **kbl-web-moi → Settings → Domains & Routes → Add → Custom Domain**. Dùng tiemvangkimbaolam.id.vn; thêm www nếu đang dùng. Nếu Cloudflare báo DNS đã có record, chỉ xử lý A/AAAA/CNAME đúng hostname @/www đang trỏ hosting cũ theo hướng dẫn của wizard; giữ MX/TXT email và xác minh khác. Không xóa nameserver Cloudflare hoặc tên miền.

Thêm hai path /admin* và /api/admin* của miền chính vào cùng ứng dụng Access để giữ AUD. Kiểm tra lại Admin, API Windows và QR sau khi chuyển. Giữ route/routes không khai báo trong file Wrangler để quản lý domain tại dashboard; không thêm routes: [] khi cập nhật. Cấu hình Windows tải lại từ Admin miền chính để serverUrl không còn URL thử. Không xóa Worker/database cũ ngay; chỉ lưu dự phòng, source mới không tự đọc dữ liệu cũ.

Tên miền cũ được giữ, hosting Tenten không còn là nơi chạy website mới. Không tự khôi phục các khóa Facebook/YouTube hoặc dữ liệu server cũ chỉ từ source; các quyền đó nối sau.

## Tự cập nhật qua GitHub sau này

Source mới được chuẩn bị cho nhánh **kbl-web-moi** trong repo **tiemvangkimbaolam-png/kbl-web**. Nhánh main vẫn là source cũ; không nối Worker cũ kbl-backup với nhánh mới và không merge lên main để thử triển khai.

Cloudflare Worker mới **kbl-web-moi** → Settings → Builds → Connect repository:

| Trường | Giá trị |
|---|---|
| Repository | tiemvangkimbaolam-png/kbl-web |
| Production branch | kbl-web-moi |
| Worker name | kbl-web-moi |
| Root directory | / nếu package.json ở gốc repo |
| Build command | npx --yes pnpm@11.25.0 install --frozen-lockfile && npm run build:cloudflare |
| Deploy command | npm run deploy:cloudflare |
| Node version | 24 |

Database ID và Team domain đã được cấu hình cho tài nguyên mới. Khi thiếu AUD, deploy chỉ cho phép Worker thử workers.dev, giữ Admin khóa 503 và không chuyển miền. Lệnh check:cloudflare và bước nghiệm thu đầy đủ vẫn yêu cầu AUD hợp lệ của KBL Admin Moi; không bỏ xác thực. Có code hoặc build thành công chưa chứng minh website đã chạy. Không gửi token Cloudflare, mật khẩu hay cookie vào repo.

Wrangler name phải khớp tên Worker. Khi đã nối Git và kiểm tra triển khai đầu thành công, cập nhật code trên nhánh kbl-web-moi sẽ tự build/deploy. Không upload ZIP nguyên cục, node_modules, dist hay thư mục Windows vận hành chứa config/profile. Nếu muốn dùng repo mới sau này, chép nội dung source vào gốc repo và chọn đúng nhánh tương ứng; không chia thành nhiều ZIP trên server.

Tài liệu chính thức: [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/), [Cloudflare Access JWT](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/), [Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/).

Đã kiểm tra build và bài kiểm thử xác thực/sync trong môi trường phát triển; chưa đăng nhập hoặc triển khai thực tế vào tài khoản Cloudflare trong ảnh. Chưa đổi DNS. Bản Sites riêng tư trước đó được giữ nguyên.
