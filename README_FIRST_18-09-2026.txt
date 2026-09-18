KIM BAO LAM - HOUSE 2 FULL NODE TWIN 100
18-09-2026

BAN NAY THAY THE CAC ZIP CHUA CAI TRUOC DO:
- KBL_WEB_SAFE_MERGED_AI_BUDGET_INTENT_FIX_18-09-2026.zip
- KBL_WEB_SAFE_MERGED_AI_AGENT_V8_FULL_POWER_18-09-2026.zip
- KBL_WEB_SAFE_MERGED_AI_AGENT_V8_FULL_POWER_R2_AUDITED_18-09-2026.zip
- KBL_WEB_SAFE_MERGED_AI_AGENT_V8_HOUSE2_TWIN_UI_AUTO_SYNC_18-09-2026.zip

KHONG CAN CAI CHONG CAC BAN TREN. app.js trong ZIP nay da chua AI Agent V8 R2 + budget intent fix.

MUC TIEU:
- House 2 chay cung app.js, views, modules, public assets va API nhu House 1.
- Login/session, Admin, AI Agent, Prompt AI, AI Market, san pham, gio hang/don/giu mau va cac API Node deu chay tren same-code Node container khi House 2 active.
- Runtime data/uploads sync House 1 -> R2 va sync nguoc lai truoc failback.
- Push main sau nay build lai ca Worker + Docker image, khong phai sua giao dien House 2 rieng.

CAC FILE GIAO DIEN DA CHOT KHONG BI SUA TRONG RELEASE NAY:
- views/home.html
- views/admin.html
- public/kbl-international-v4.js
- .gitignore

CHU Y MOT LAN:
1) Cloudflare Containers can Workers Paid.
2) Can tao R2 S3 Object Read+Write token va Worker secrets theo HOUSE2_FULL_TWIN_100_SETUP_18-09-2026.txt.
3) Tao bundle secret tu .env bang:
   node scripts/build-house2-env-bundle.js .env
   Thu muc data/.house2-secrets TUYET DOI KHONG COMMIT.
4) Cloudflare Workers Builds production Deploy command:
   cd cloudflare-backup && npm install --no-audit --no-fund && npm run deploy

GITHUB DESKTOP:
- Copy de cac file cua ZIP vao D:\KBL\kbl-web
- Mo GitHub Desktop, xem Changes
- Summary: Upgrade House 2 to full Node twin runtime
- Commit to main
- Push origin

SAU DEPLOY:
https://kbl-backup.tiemvangkimbaolam.workers.dev/api/health
Can co:
- version: 1.2.1-house2-full-node-twin-safe
- fullNodeRuntimeReady: true
- readyForFailover: true
- house2Runtime: same-node-app-container

KHONG TAT TENTEN DE TEST DOT NGOT. Lan dau test bang planned failover endpoint theo file SETUP, de prewarm House 2 va tranh transaction dang do.
Cloudflare full Node House 2 build trigger 18-09-2026
