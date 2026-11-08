# Phòng AI R40 trong bộ Cloudflare mới

Bộ mới khôi phục đúng source phòng R40 đã làm cho bản Tenten: GLB robot tam19, bàn, ghế, sofa, buồng năng lượng, phòng thể thao và các góc máy toàn phòng/sofa/năng lượng/thể thao/trên cao. Giữ geometry và tư thế R40, không vẽ lại bằng các ô trạng thái. Toàn bộ 1,66 MB tài nguyên chạy cùng website, không cần CDN hoặc đăng nhập một dịch vụ 3D.

Admin → Đội AI hiển thị phòng, bên dưới giữ nguyên thẻ tài khoản, nút mở đăng nhập/kiểm tra/ẩn và luồng công việc. Nút + Tài khoản trong phòng mở đúng form thêm tài khoản hiện có. Chọn robot cuộn đến thẻ hồ sơ tương ứng. Tối đa 20 tài khoản thực; các vị trí chưa gắn vẫn là robot xám, không phải tài khoản được tạo tự động.

Trạng thái phòng lấy từ heartbeat và job owner/status của Admin. Báo cáo mất mới hơn 30 giây chuyển mất đồng bộ. Heartbeat cũ hơn 60 giây không được hiển thị sẵn sàng. Job complete không biến thành đang làm; một bước complete không được coi là bài đã đăng. Hoạt cảnh nghỉ, thể thao hoặc sạc chỉ là minh họa giao diện, không phải bằng chứng mô hình đang suy nghĩ hay gọi API.

Scene nằm trong iframe cùng origin. Parent chỉ gửi hợp đồng đã lọc: ID/tên nhà cung cấp/trạng thái/mã bước việc; không gửi prompt, token, lease hash hoặc dữ liệu khách. Hai đầu kiểm tra origin và source cửa sổ. Scene không tự gọi API Admin. Khi không có WebGL, dùng hình tĩnh từ cùng geometry; danh sách và luồng vẫn hoạt động.

Đã chạy ba bài kiểm thử projection/privacy/import graph và TypeScript. Asset R40 được giữ nguyên từ source cũ. Chưa xác nhận GPU/WebGL và tương tác trên Chrome Windows thực tế của người dùng; đây không phải bằng chứng một tin đã được AI tạo và đăng.
