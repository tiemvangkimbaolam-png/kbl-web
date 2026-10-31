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
