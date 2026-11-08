export function checkConfig(config, { publicStaging = false } = {}) {
    if (config.name !== 'kbl-web-moi' || config.d1_databases?.[0]?.database_name !== 'kbl-web-moi-db' || config.r2_buckets?.[0]?.bucket_name !== 'kbl-web-moi-media') throw Error('Giữ đúng tên tài nguyên mới; không ghi đè kbl-backup.');
    const id = config.d1_databases[0].database_id;
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id || '') || id === '00000000-0000-4000-8000-000000000000') throw Error('Điền đúng Database ID mới của kbl-web-moi-db.');
    if (Object.hasOwn(config, 'routes') || Object.hasOwn(config, 'route')) throw Error('Quản lý miền ở dashboard sau nghiệm thu; không đặt route/routes trong bản thử.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.vars?.OWNER_EMAIL || '') || config.vars?.KBL_AUTH_MODE !== 'cloudflare-access') throw Error('Chưa đặt email chủ hoặc chế độ Cloudflare Access.');
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(config.vars?.CF_ACCESS_TEAM_DOMAIN || '')) throw Error('Điền Team domain Cloudflare Access.');
    const audience = config.vars?.CF_ACCESS_AUD || '';
    if (audience && !/^[a-f0-9]{64}$/.test(audience)) throw Error('AUD phải đúng 64 ký tự hex của ứng dụng KBL Admin Moi.');
    if (!audience) {
        if (!publicStaging || config.workers_dev !== true || config.preview_urls !== false) throw Error('Điền AUD trước khi nghiệm thu Admin và chuyển miền.');
        // The runtime JWT gate remains unchanged and returns503 for every
        // Admin route. This only permits verification of the public test host.
        return { adminReady: false, publicStaging: true };
    }
    return { adminReady: true, publicStaging };
}
