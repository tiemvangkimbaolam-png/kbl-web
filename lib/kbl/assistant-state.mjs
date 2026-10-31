import { CAPABILITIES } from './domain.mjs';
export function assistantState(settings, accounts, workers, now = Date.now()) {
    const fresh = r => Number.isFinite(r?.lastSeen) && r.lastSeen >= now - 60000 && r.lastSeen <= now + 60000;
    const enabled = settings.teamEnabled === true && settings.autoConsult !== false;
    const eligible = accounts.filter(a => a.enabled !== false && fresh(a) && workers.some(w => w.id === a.workerId && fresh(w)) &&
        CAPABILITIES[a.provider]?.includes('write') && a.roles?.includes('write'));
    const ready = eligible.some(a => a.status === 'ready'), busy = eligible.some(a => a.status === 'working');
    const state = !enabled ? 'disabled' : ready ? 'ready' : busy ? 'busy' : 'offline';
    const message = { disabled: 'Tư vấn AI đang tạm dừng. Cửa hàng vẫn nhận câu hỏi để trả lời.',
        ready: 'AI tư vấn đang kết nối. Câu hỏi được đưa vào hàng đợi xử lý.',
        busy: 'AI đang thực hiện công việc khác. Câu hỏi sẽ chờ đến lượt.',
        offline: 'AI tư vấn chưa có phiên kết nối sẵn sàng. Cửa hàng vẫn nhận câu hỏi để trả lời.' }[state];
    return { enabled, available: enabled && ready, state, message };
}
