"""Package source + Windows without operational data. Maintainer tool, not a Windows runtime dependency."""
import argparse
import hashlib
import json
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def write(z, name, data):
    info = zipfile.ZipInfo(name, (2026, 10, 26, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    z.writestr(info, data)


def windows_zip():
    target = ROOT / 'public/downloads/KBL-WINDOWS-2.zip'
    target.parent.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in (ROOT / 'windows').rglob('*') if p.is_file())
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for p in files:
            rel = p.relative_to(ROOT / 'windows')
            if p.name == 'kbl-config.json' or any(x in rel.parts for x in ('node_modules', 'work', 'output', 'profiles', '.kbl-render-runtime')) or p.suffix in ('.sqlite', '.log'):
                raise RuntimeError('Operational file found in Windows source; refusing package')
            write(z, 'KBL_WINDOWS_MOI/' + str(rel), p.read_bytes())
        write(z, 'KBL_WINDOWS_MOI/POS_SYNC.md', (ROOT / 'docs/POS_SYNC.md').read_bytes())
    with zipfile.ZipFile(target) as z:
        if z.testzip():
            raise RuntimeError('Corrupt Windows archive')
        for p in files:
            assert z.read('KBL_WINDOWS_MOI/' + str(p.relative_to(ROOT / 'windows'))) == p.read_bytes()
    return target


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    native = windows_zip()
    print(json.dumps({'windowsBytes': native.stat().st_size, 'sha256': hashlib.sha256(native.read_bytes()).hexdigest()}))
    if not args.output:
        return
    paths = subprocess.check_output(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], cwd=ROOT).decode().split('\0')
    note = '''KBL WEBSITE MỚI + WINDOWS · BỔ SUNG POS 26/10/2026

Đã bổ sung cấu hình Cloudflare trực tiếp. Đọc KBL_WEB_MOI/HUONG_DAN_CLOUDFLARE.md, chạy hai file CLOUDFLARE_1/2 trong thư mục đó theo hướng dẫn. Chưa triển khai vào tài khoản Cloudflare của người dùng và chưa đổi DNS. KHÔNG upload vào Plesk/Tenten đang thiếu dung lượng.

KBL_WEB_MOI/ là source website; KBL_WEB_MOI/windows/ là bộ Windows mới. Đọc docs/POS_SYNC.md trước khi cấu hình. Sáu file POS gốc không cần thay và không nằm trong gói này. Không chứa dữ liệu khách, API key, token worker, cookie hay hồ sơ Chrome.

Đã kiểm tra 31 test, TypeScript, build Sites/Cloudflare và Wrangler dry-run; test dùng fixture theo schema thật. Chưa chạy trực tiếp với POS Windows/tài khoản AI của người dùng. Facebook/YouTube và các quyền ứng dụng cũ chưa được khôi phục từ source.

Chạy thử kbl-web-moi.workers.dev trước, giữ nguyên Worker kbl-backup và tên miền cũ cho tới khi kiểm tra xong. Không coi ZIP này là bằng chứng đã đăng tin/video hoặc đã chuyển website thành công.
'''
    args.output.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with zipfile.ZipFile(args.output, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for rel in sorted(set(paths)):
            if not rel:
                continue
            p = ROOT / rel
            if not p.is_file():
                continue
            if rel.startswith('.openai/'):
                continue  # Deployment ownership metadata belongs to the existing preview only.
            if p.is_symlink() or rel.startswith(('.git/', '.env', 'upload/', 'work/', 'outputs/')) or p.name == 'kbl-config.json' or p.suffix in ('.sqlite', '.sqlite-wal', '.sqlite-shm'):
                raise RuntimeError('Refusing non-source file: ' + rel)
            if p.stat().st_size > 8 * 1024 * 1024:
                raise RuntimeError('Unexpected large source file: ' + rel)
            write(z, 'KBL_WEB_MOI/' + rel, p.read_bytes())
            count += 1
        write(z, 'DOC_TRUOC_KHI_CAI.txt', note.encode())
    with zipfile.ZipFile(args.output) as z:
        assert z.testzip() is None
    print(json.dumps({'sourceFiles': count, 'zipBytes': args.output.stat().st_size, 'sha256': hashlib.sha256(args.output.read_bytes()).hexdigest()}))


if __name__ == '__main__':
    main()
