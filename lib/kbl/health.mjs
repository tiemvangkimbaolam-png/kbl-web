export async function bindingHealth(bindings) {
    let database = false, files = false;
    const checks = {};
    try {
        if (!bindings.DB) throw Error('binding');
        for (const table of ['records', 'assets']) await bindings.DB.prepare(`SELECT id FROM ${table} LIMIT 1`).first();
        await bindings.DB.prepare('SELECT id,transitioned_result FROM jobs LIMIT 1').first();
        database = true;
        checks.database = 'ready';
    } catch { checks.database = bindings.DB ? 'schema-or-access-required' : 'binding-required'; }
    try {
        if (!bindings.BUCKET) throw Error('binding');
        await bindings.BUCKET.head('__kbl_health_probe__');
        files = true;
        checks.files = 'ready';
    } catch { checks.files = bindings.BUCKET ? 'access-required' : 'binding-required'; }
    return { ok: database && files, database, files, checks };
}
