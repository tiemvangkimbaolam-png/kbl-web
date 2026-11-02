'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), cp = require('node:child_process'), qr = require('./qr.bundle.cjs');
const THEME_VERSION = 2;
const THEME = Object.freeze({ paper: '0xfffdfb', peach: '0xfff2e9', copper: '0x9b4d2d', ink: '0x102c43', muted: '0x65717d', line: '0xead1bf' });
const money = n => new Intl.NumberFormat('vi-VN').format(n) + ' đ';
const clean = s => String(s || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
// A layout-only wrap. All amounts come from the immutable POS/story snapshot.
function lines(value, width, max = 2) {
    const words = clean(value).split(' '), out = []; let row = '';
    for (const word of words) {
        if (row && (row + ' ' + word).length > width) { out.push(row); row = word; } else row += (row ? ' ' : '') + word;
    }
    if (row) out.push(row);
    return out.length > max ? [...out.slice(0, max - 1), out[max - 1].slice(0, width - 1) + '…'].join('\n') : out.join('\n');
}
function run(exe, args, cwd) { return new Promise((resolve, reject) => {
    const p = cp.spawn(exe, args, { cwd, windowsHide: true, shell: false, stdio: ['ignore', 'ignore', 'pipe'] }); let err = '';
    const timer = setTimeout(() => { p.kill(); reject(Error('Dựng thẻ ảnh quá hạn.')); }, 120000);
    p.stderr.on('data', b => err = (err + b).slice(-2500)); p.on('error', e => { clearTimeout(timer); reject(e); });
    p.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error('Không dựng được ảnh: ' + err.slice(-900))); });
}); }
function copyFonts(dir) {
    for (const [name, file] of Object.entries({ regular: 'BeVietnamPro-Regular.ttf', bold: 'BeVietnamPro-Bold.ttf', brand: 'PlayfairDisplay-Bold.ttf' })) {
        const source = path.join(__dirname, 'card-assets', file);
        if (!fs.existsSync(source)) throw Error('Thiếu font mẫu local worker: ' + file);
        fs.copyFileSync(source, path.join(dir, 'kbl-' + name + '.ttf'));
    }
}
function validate({ product, prices, at, source }) {
    if (!Number.isFinite(new Date(at).getTime())) throw Error('Thiếu thời điểm chốt dữ liệu.');
    if (product) {
        if (!source || !clean(product.sku) || !clean(product.name)) throw Error('Thiếu ảnh gốc hoặc mã/tên sản phẩm.');
        if (!Number.isFinite(product.price) || product.price <= 0) throw Error('Chưa có giá sản phẩm đã chốt từ POS.');
        return null;
    }
    const rows = ['9999', '980', '610'].map(code => (prices || []).filter(r => r.code === code));
    if (rows.some(matches => matches.length !== 1)) throw Error('Bảng giá cần đúng một dòng 9999/980/610.');
    for (const [r] of rows) if (![r.buy, r.sell].every(n => Number.isFinite(n) && n > 0) || !['đồng/chỉ', 'đ/chỉ'].includes(r.unit)) throw Error('Bảng giá cần số POS hợp lệ, đơn vị đồng/chỉ; không tự quy đổi.');
    return rows.map(matches => matches[0]);
}
async function card({ dir, ffmpeg, company = {}, product, prices, at, source, index = 0, preview = false }) {
    // Freeze at admission, before QR/FFmpeg awaits. New live prices belong to
    // the next job and cannot leak into the card currently being built.
    ({ company, product, prices } = structuredClone({ company, product, prices }));
    const rows = validate({ product, prices, at, source });
    if (!Number.isSafeInteger(index) || index < 0 || index > 10) throw Error('Chỉ số mẫu không hợp lệ.');
    fs.mkdirSync(dir, { recursive: true }); copyFonts(dir);
    const prefix = 'card-' + index, date = new Date(at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false });
    const url = product ? 'https://tiemvangkimbaolam.id.vn/vi/san-pham/' + encodeURIComponent(product.sku) : 'https://tiemvangkimbaolam.id.vn/bang-gia';
    await qr.toFile(path.join(dir, prefix + '-qr.png'), url, { width: 128, margin: 2, errorCorrectionLevel: 'M' });
    const text = (name, value) => { const f = prefix + '-' + name + '.txt'; fs.writeFileSync(path.join(dir, f), String(value), 'utf8'); return f; };
    const draw = (name, value, x, y, size, color = THEME.ink, font = 'regular') => {
        const t = text(name, value), common = `fontfile=kbl-${font}.ttf:textfile='${t}':expansion=none`;
        return `drawtext=${common}:x=${x}:y=${y}:fontsize=${size}:fontcolor=${color}:line_spacing=10`;
    };
    const box = (x, y, w, h, color, t = 'fill') => `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${color}:t=${t}`;
    const filters = ['[0:v]null[base]']; let label = '[base]';
    const add = f => { const next = '[v' + filters.length + ']'; filters.push(label + f + next); label = next; };
    const inputs = ['-f', 'lavfi', '-i', 'color=c=' + THEME.paper + ':s=1080x1350'];
    let qrInput = 1;
    if (product) { inputs.push('-i', source); qrInput = 2; }
    inputs.push('-i', prefix + '-qr.png');
    add(box(26, 26, 1028, 1298, THEME.line, '2'));
    add(box(27, 27, 1026, 150, THEME.peach));
    add(draw('eyebrow', 'T R A N G  S Ứ C   ·   V À N G', 64, 49, 17, THEME.copper, 'bold'));
    add(draw('brand', lines(company.name || 'TIỆM VÀNG KIM BẢO LÂM', 35, 1), 60, 80, 43, THEME.copper, 'brand'));
    add(draw('domain', 'tiemvangkimbaolam.id.vn', 64, 142, 18, THEME.muted));
    if (product) {
        add(draw('section', 'BỘ SƯU TẬP TẠI TIỆM', 64, 200, 20, THEME.copper, 'bold'));
        add(box(62, 244, 956, 612, THEME.line));
        add(box(64, 246, 952, 608, 'white'));
        // Contain the complete original photo; never crop/repaint jewellery.
        filters.push('[1:v]scale=916:572:force_original_aspect_ratio=decrease,pad=952:608:(ow-iw)/2:(oh-ih)/2:white[photo]');
        const next = '[productbase]'; filters.push(label + '[photo]overlay=64:246' + next); label = next;
        if (preview) {
            add(box(64, 806, 952, 48, THEME.peach));
            add(draw('preview', 'BẢN XEM TRƯỚC · CHỜ ĐỐI CHIẾU ẢNH / SKU', 86, 819, 20, THEME.copper, 'bold'));
        }
        add(draw('name', lines(product.name, 35, 2), 64, 880, 36, THEME.ink, 'bold'));
        add(draw('sku', 'Mã ' + clean(product.sku) + '   ·   Vàng ' + clean(product.purity), 64, 985, 23));
        const weight = Number.isFinite(product.weight) ? (product.weight / 3.75).toLocaleString('vi-VN', { maximumFractionDigits: 3 }) + ' chỉ' : 'Xác nhận tại tiệm';
        add(draw('weight', 'Trọng lượng: ' + weight, 64, 1025, 23, THEME.muted));
        add(box(62, 1078, 956, 108, THEME.peach));
        add(draw('price-label', 'GIÁ THAM KHẢO', 84, 1094, 17, THEME.copper, 'bold'));
        add(draw('price', money(product.price), 84, 1121, 43, THEME.copper, 'bold'));
    } else {
        add(draw('title', 'BẢNG GIÁ VÀNG', 64, 216, 56, THEME.ink, 'brand'));
        add(draw('units', 'ĐỒNG / CHỈ', 64, 302, 21, THEME.copper, 'bold'));
        add(draw('snapshot', 'Chốt lúc ' + date, 64, 343, 23, THEME.muted));
        add(box(62, 414, 956, 66, THEME.peach));
        add(draw('type-head', 'LOẠI VÀNG', 84, 435, 20, THEME.copper, 'bold'));
        add(draw('buy-head', 'MUA VÀO', 418, 435, 20, THEME.copper, 'bold'));
        add(draw('sell-head', 'BÁN RA', 750, 435, 20, THEME.copper, 'bold'));
        rows.forEach((r, i) => {
            const y = 497 + i * 170;
            add(box(62, y, 956, 150, i % 2 ? THEME.paper : THEME.peach));
            add(box(62, y, 5, 150, THEME.copper));
            add(draw('gold-' + i, r.code === '9999' ? '999.9' : r.code, 88, y + 50, 43, THEME.ink, 'bold'));
            const buy = new Intl.NumberFormat('vi-VN').format(r.buy), sell = new Intl.NumberFormat('vi-VN').format(r.sell);
            const size = Math.min(39, Math.floor(300 / (Math.max(buy.length, sell.length) * .66)));
            add(draw('buy-' + i, buy, 360, y + 55, size, THEME.ink, 'bold'));
            add(draw('sell-' + i, sell, 690, y + 55, size, THEME.copper, 'bold'));
        });
        add(draw('variant', index ? 'GIỮ MỐC GIÁ ĐÃ CHỐT' : 'GIÁ VÀNG TẠI KIM BẢO LÂM', 64, 1045, 23, THEME.copper, 'bold'));
        add(draw('note', 'Giá có thể thay đổi. Xác nhận tại tiệm trước giao dịch.', 64, 1094, 22, THEME.muted));
    }
    add(box(64, 1200, 778, 2, THEME.line));
    add(draw('time', 'Giá tham khảo lúc ' + date, 64, 1218, 18, THEME.muted));
    add(draw('address', lines(company.address || '', 68, 2), 64, 1250, 18, THEME.ink));
    if (clean(company.phone)) add(draw('phone', clean(company.phone), 64, 1300, 16, THEME.copper, 'bold'));
    filters.push(label + '[' + qrInput + ':v]overlay=870:1190[out]');
    const file = path.join(dir, prefix + '.jpg');
    await run(ffmpeg, ['-y', '-nostdin', '-threads', '1', '-filter_complex_threads', '1', ...inputs, '-filter_complex', filters.join(';'), '-map', '[out]', '-frames:v', '1', '-q:v', '2', path.basename(file)], dir);
    fs.writeFileSync(path.join(dir, prefix + '-layout.json'), JSON.stringify({ themeVersion: THEME_VERSION, width: 1080, height: 1350, snapshotAt: at, sku: product?.sku || null, price: product?.price ?? null, prices: rows, sourceHash: source ? crypto.createHash('sha256').update(fs.readFileSync(path.resolve(dir, source))).digest('hex') : null, url }));
    return file;
}
async function createGoldImages({ job, lease, bridge, config, workDir }) {
    job = structuredClone(job);
    const tools = require('./render.cjs').toolsFor(config), story = job.context.story;
    if (story?.kind !== 'gold' || !story.priceSnapshot) throw Error('Chỉ dựng thẻ giá từ bản chụp đã chốt.');
    const hash = crypto.createHash('sha256').update(JSON.stringify({ snapshot: story.priceSnapshot, company: job.context.company, version: THEME_VERSION })).digest('hex');
    const dir = path.join(workDir, job.storyId, hash); fs.mkdirSync(dir, { recursive: true }); const rows = [];
    for (let i = 0; i < 2; i++) {
        const file = await card({ dir, ffmpeg: tools.ffmpeg, company: job.context.company, prices: story.priceSnapshot.rows, at: story.editionAt, index: i });
        const v = await bridge.request('/api/worker/assets?storyId=' + job.storyId + '&purpose=news-image', 'POST', fs.readFileSync(file), { 'Content-Type': 'image/jpeg', 'x-kbl-job-id': job.id, 'x-kbl-job-lease': lease });
        rows.push({ assetId: v.assetId, caption: 'Bảng giá cửa hàng tại mốc ' + story.editionAt });
    }
    return { rows };
}
async function newsPoster({ dir, ffmpeg, source, index, illustration = true }) {
    const font = process.platform === 'win32' ? "fontfile='C\\:/Windows/Fonts/arial.ttf'" : 'font=DejaVu Sans', file = 'news-poster-' + index + '.jpg';
    fs.writeFileSync(path.join(dir, 'news-ai-label.txt'), 'Ảnh minh họa AI - không phải ảnh sự kiện thực tế', 'utf8');
    await run(ffmpeg, ['-y', '-nostdin', '-threads', '1', '-i', source, '-vf', "scale=1080:1350:force_original_aspect_ratio=decrease,pad=1080:1350:(ow-iw)/2:(oh-ih)/2:white" + (illustration ? ',drawtext=' + font + ":textfile=news-ai-label.txt:expansion=none:x=30:y=h-45:fontsize=23:fontcolor=black:box=1:boxcolor=white@0.85" : ''), '-frames:v', '1', '-q:v', '2', file], dir);
    return path.join(dir, file);
}
module.exports = { card, createGoldImages, newsPoster, THEME_VERSION, THEME };
