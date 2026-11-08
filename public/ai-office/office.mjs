import { createSpaceStudio } from './studio/scene.mjs';
import { paintScene } from './cpu-view.mjs';
import { normalizeFleetSnapshot, STATE_LABELS } from './studio/fleet-contract.mjs';
const host = document.getElementById('stage'), labels = document.getElementById('labels'), loading = document.getElementById('loading'), status = document.getElementById('status'), selection = document.getElementById('selection');
const cameraNames = { hero: 'Toàn phòng', lounge: 'Sofa', energy: 'Năng lượng', gym: 'Thể thao', overview: 'Trên cao' }, cameras = Object.keys(cameraNames), tags = new Map();
let core, cpu = false, snapshot, receivedAt = 0, disposed = false, selected = '', camera = 0, lastLabelAt = 0;
function tell(type, extra = {}) { if (window.parent !== window) window.parent.postMessage({ type, ...extra }, window.location.origin); }
function select(id) { selected = id; core?.selectRobot(id); const bot = snapshot?.bots.find(b => b.connectionId === id); selection.hidden = !bot; if (bot) { selection.textContent = bot.name + ' · ' + STATE_LABELS[bot.state] + (bot.jobs.length ? ' · ' + bot.jobs.map(j => j.title).join(', ') : ' · Chưa có việc đang nhận'); tell(bot.kind === 'vacant' ? 'kbl-office-add' : 'kbl-office-select', { id }); } }
function paint() { if (cpu && core) paintScene(core); }
function placeLabels() { if (!core || performance.now() - lastLabelAt < 150) return; lastLabelAt = performance.now(); for (const p of core.labelPositions()) { const tag = tags.get(p.id); if (tag) { tag.hidden = !p.visible; tag.style.left = p.x + 'px'; tag.style.top = p.y + 'px'; } } }
function apply() {
    if (!core || !snapshot) return;
    core.setFleetSnapshot(snapshot);
    for (const tag of tags.values()) tag.remove(); tags.clear();
    for (const b of snapshot.bots) { if (b.kind === 'vacant') continue; const tag = document.createElement('button'); tag.className = 'tag'; tag.textContent = b.name; tag.title = b.name + ' · ' + STATE_LABELS[b.state]; tag.setAttribute('aria-pressed', String(selected === b.connectionId)); tag.onclick = () => select(b.connectionId); tags.set(b.connectionId, tag); labels.append(tag); }
    const accounts = snapshot.bots.filter(b => b.kind === 'account'); status.textContent = accounts.length + '/20 tài khoản · ' + accounts.filter(b => b.connected).length + ' kết nối · 20 vị trí robot';
    if (cpu) { const paused = core.isMotionPaused(); core.setMotionPaused(false); core.stepLive(18); core.setMotionPaused(paused); } paint(); placeLabels();
}
window.addEventListener('message', e => { if (e.origin !== window.location.origin || e.source !== window.parent || e.data?.type !== 'kbl-office-state') return; try { snapshot = normalizeFleetSnapshot(e.data.snapshot); receivedAt = Date.now(); apply(); } catch { status.textContent = 'Báo cáo trạng thái không hợp lệ'; } });
document.getElementById('add').onclick = () => tell('kbl-office-add');
document.getElementById('camera').onclick = e => { camera = (camera + 1) % cameras.length; core?.setCamera(cameras[camera]); e.currentTarget.textContent = 'Góc: ' + cameraNames[cameras[camera]]; paint(); placeLabels(); };
document.getElementById('motion').onclick = e => { if (!core) return; const paused = !core.isMotionPaused(); core.setMotionPaused(paused); e.currentTarget.textContent = paused ? 'Tiếp tục chuyển động' : 'Dừng chuyển động'; e.currentTarget.setAttribute('aria-pressed', String(paused)); };
const visible = () => core?.setActive(!document.hidden); document.addEventListener('visibilitychange', visible);
try {
    const opts = { live: true, quality: 'low', brightness: .95, onSelect: select, onFrame: placeLabels, onError: message => { loading.hidden = false; loading.textContent = message; } };
    try { core = await createSpaceStudio(host, opts); } catch { cpu = true; core = await createSpaceStudio(host, { ...opts, geometryOnly: true, manual: true }); document.getElementById('note').textContent = 'WebGL không sẵn sàng: hình tĩnh từ cùng phòng 3D; trạng thái vẫn cập nhật.'; document.getElementById('motion').disabled = true; }
    if (disposed) core.dispose(); else { core.setMotionPaused(cpu || matchMedia('(prefers-reduced-motion: reduce)').matches); loading.hidden = !core.robotError; apply(); paint(); }
} catch { loading.textContent = 'Không mở được phòng 3D. Dùng danh sách tài khoản bên dưới để tiếp tục.'; }
tell('kbl-office-ready');
const stale = setInterval(() => { if (receivedAt && Date.now() - receivedAt > 30000) { core?.markFleetStale(); status.textContent = 'Báo cáo đã cũ · chờ kết nối Admin'; paint(); } }, 5000);
window.addEventListener('pagehide', () => { disposed = true; clearInterval(stale); document.removeEventListener('visibilitychange', visible); core?.dispose(); tags.clear(); }, { once: true });
