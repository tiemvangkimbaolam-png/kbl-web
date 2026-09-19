KBL GROWTH AUTOPILOT V1.2.1 - WATCHDOG + NEAR-NOW TEST
Ngay: 19/09/2026

MUC TIEU
- Khong con tinh trang lich bien mat ma khong biet da dang hay bi chan.
- Hien ro Watchdog: timer server -> lich -> poster/QA -> Publisher -> Post ID.
- Hien rieng bai bi chan / Review va lich su Auto Publish gan nhat.
- Them KIEM TRA AUTO: probe API that, nhung KHONG dang bai.
- Them TEST BAI GAN NHAT +3 PHUT: keo dung 1 bai scheduled API-ready ve 3 phut sau thoi diem bam de test pipeline that.

NUT KIEM TRA MOI
1) [KIEM TRA AUTO]
   - Kiem tra Autopilot tong + Auto Publish.
   - Kiem tra heartbeat scheduler server (<=150 giay).
   - Kiem tra co it nhat 3 SKU du dieu kien.
   - Probe API doc tai khoan that cua Facebook/Instagram/Threads/TikTok/Telegram neu preflight ready.
   - KHONG tao post, KHONG gui bai, KHONG tieu hao Gemini poster.

2) [TEST BAI GAN NHAT +3 PHUT]
   - Khong hardcode gio. Moi lan bam, bai scheduled API-ready som nhat se duoc doi dueAt = thoi diem bam + 3 phut.
   - Van chay dung pipeline that: 3 SKU -> poster/card gia JIT -> QA -> Publisher -> Post ID.
   - Neu poster/QA fail: bai se vao Review va Watchdog hien ly do, khong con bien mat.
   - Khong can mo trinh duyet 3 phut; server tu chay.

WATCHDOG
- AUTO READY: timer server co heartbeat, Auto Publish bat, co kenh API-ready.
- OVERDUE: co bai qua gio >10 phut van con scheduled.
- REVIEW/BLOCKED: hien ly do ngay tren Growth card.
- QUEUED/PROCESSING/PUBLISHED: hien lich su dispatch va Post/Media ID khi co.

CAI DAT QUA GITHUB DESKTOP
- Chi can lay 2 file: app.js va views/admin.html.
- Chep vao repo kbl-web local, khong xoa data/, modules/, public/, uploads/, .env.
- GitHub Desktop -> review Changes -> Commit main -> Push origin.
- Plesk auto deploy hoac Deploy Now, sau do Restart Node App.
- Cho 60-90 giay de Watchdog co heartbeat lan dau.

TEST DE XAC NHAN AUTO PUBLISH
A. Bam KIEM TRA AUTO. Can thay AUTO READY va it nhat 1 kenh probe OK.
B. Bam TEST BAI GAN NHAT +3 PHUT.
C. Sau 3-5 phut:
   - Neu thanh cong: Lich su Auto Publish -> PUBLISHED + Post/Media ID.
   - Neu bi chan: BAI BI CHAN / REVIEW se hien ly do poster/QA/API.
   - Neu van scheduled >10 phut: Watchdog bao OVERDUE.

AN TOAN
- TikTok Not Approved van se bi preflight block; V1.2.1 khong lach quyen TikTok.
- Test +3 phut chi keo 1 bai da co lich va API-ready, khong tao bai rac moi.
- Video van thu cong nhu truoc.

R2 FINAL VERIFY FIX
- AUTO READY bat buoc co scheduler heartbeat <=150 giay. Khong con false-positive neu API song nhung timer server chua chay.
