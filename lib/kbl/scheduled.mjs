export const hourlyMaintenanceDue = at => Number.isFinite(at) && Math.floor(at / 60000) % 60 === 0;
// A failed source/provider must not prevent unrelated durable work from running.
export async function runScheduledTasks(tasks, event) {
    const entries = Object.entries(tasks);
    const results = await Promise.allSettled(entries.map(([,task]) => Promise.resolve().then(task)));
    const failed = results.flatMap((r,i) => r.status === 'rejected' ? [entries[i][0]] : []);
    for (const name of failed) await event('automation-error', 'Chưa hoàn tất ' + name + '; giữ dữ liệu và thử ở lượt kế tiếp.').catch(() => {});
    if (failed.length) throw Error('KBL scheduled tasks incomplete.');
}
export async function runMaintenance({ tick, cleanup, event }) {
    let failed = false;
    try { await tick(); }
    catch {
        failed = true;
        await event('scheduler-error', 'Chưa chạy xong lượt điều phối; giữ hàng đợi để thử ở lượt kế tiếp.').catch(() => {});
    }
    try { await cleanup(); }
    catch {
        failed = true;
        await event('cleanup-error', 'Chưa dọn xong file tạm có biên nhận; giữ file và thử lại sau.').catch(() => {});
    }
    if (failed) throw Error('KBL maintenance incomplete; durable work retained.');
    return { ok: true };
}
