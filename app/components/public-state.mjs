export function savedCart(raw) {
    let rows;
    try { rows = JSON.parse(raw || '[]'); } catch { return []; }
    if (!Array.isArray(rows)) return [];
    const seen = new Set(), safe = [];
    for (const row of rows) {
        if (!row || typeof row.id !== 'string' || !row.id || row.id.length > 150 || seen.has(row.id) || typeof row.name !== 'string' || !row.name || row.name.length > 150 || !Number.isSafeInteger(row.price) || row.price < 0 || !Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 10) continue;
        seen.add(row.id);
        const { id, name, price, quantity } = row;
        safe.push({ id, name, price, quantity });
        if (safe.length === 20) break;
    }
    return safe;
}
