export function isFresh(row, now = Date.now()) {
    const seen = Number(row?.lastSeen || 0), age = now - seen;
    return row?.enabled !== false && seen > 0 && age >= -5000 && age < 60000;
}
export function chooseWorker(workers, requested, now = Date.now()) {
    if (requested) return workers.find(w => w.id === requested) || null;
    return workers.find(w => isFresh(w, now)) || null;
}
export function latestStage(jobs, stage) {
    return jobs.filter(j => j.stage === stage).sort((a, b) => Number(b.updated_at || b.created_at || 0) - Number(a.updated_at || a.created_at || 0))[0];
}
export function completedStages(jobs, stages) {
    return stages.filter(stage => latestStage(jobs, stage)?.status === 'complete').length;
}
export function commandState(command, now = Date.now()) {
    if (command.status === 'pending' && command.expiresAt <= now) return { status: 'expired', text: 'Lệnh hết hạn; Windows chưa xác nhận thực hiện.' };
    if (command.status === 'done') return { status: 'done', text: command.message || 'Windows đã xác nhận thực hiện lệnh.' };
    if (command.status === 'failed') return { status: 'failed', text: command.message || 'Windows báo không thực hiện được lệnh.' };
    return { status: 'pending', text: 'Đang chờ Windows nhận và xác nhận lệnh.' };
}
