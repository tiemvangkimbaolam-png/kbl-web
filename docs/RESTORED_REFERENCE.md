# Giao diện gốc đã đối chiếu

Nguồn do người dùng sở hữu: https://tiemvangkimbaolam.id.vn/, ngày 26/10/2026. Người dùng yêu cầu làm giống chính website này.

Giữ thứ tự giá → danh mục → phần thương hiệu → tiện ích → thử trang sức/tra cứu → bảng chi tiết → tính tham khảo → hướng dẫn → lời nhắn → FAQ → liên hệ/footer. Header có logo hai hàng, tìm trang sức, tài khoản, đặt lịch và giỏ; mobile có menu và điều hướng dưới.

Tài nguyên ở public/reference-home. Template đã loại script/handler ở app/components/reference-home/template.ts; React memo giữ cây trình bày đứng yên, các vùng dữ liệu được nối bằng portal vào API mới. layout.js chỉ giữ thao tác sắp xếp/điều hướng của bản cũ đã đọc, không gọi API cũ.

Không lấy số giá trên trang cũ để công bố trên hệ thống mới. Không chép các sản phẩm bị mất ảnh, lịch sử khách hay hồ sơ cầm. Dữ liệu sản phẩm/ảnh sẽ ghép từ POS thực tế sau khi người dùng gửi source. Mức ước tính 3/2,5/2,2% và bảng Ni được giữ theo công cụ công khai đang có trên website; không dùng để sửa POS.

Các trang pháp lý là bản sao nội dung cửa hàng đã công bố. Khi thay đổi đơn vị pháp lý, chính sách hoặc miền, chủ cần cập nhật nội dung tương ứng; không tự suy đoán thay đổi pháp lý.

Giới hạn: đối chiếu phần công khai truy cập được. Admin cũ, phần sau đăng nhập, kết nối POS/Gemini và quyền mạng xã hội chưa có bằng chứng tương đương thực tế.

Source gốc đã bổ sung từ GitHub tại commit 6f68320ad2af03893509497011fc9dbcc2e18ad6. Đối chiếu backend và UI Admin cho thấy bản tháng 9 không chứa đội AI tháng 10; không dùng nó ghi đè worker mới. Nguồn tham khảo thế giới/VCB được nối lại từ logic gốc với fetch có hạn mức và cache có thời hạn.
