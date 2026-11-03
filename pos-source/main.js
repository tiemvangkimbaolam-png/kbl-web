const { app, BrowserWindow, ipcMain } = require('electron');

const path = require('path');

const fs = require('fs');

const crypto = require('crypto');



// --- THÊM THƯ VIỆN CHO MOBILE SCANNER ---

const express = require('express');

const cors = require('cors');

const os = require('os');

// ----------------------------------------



let mainWindow = null;

let targetComPort = 'COM3';

let ipcRegistered = false;



// --- THÊM BIẾN LƯU URL MẠNG LAN ---

let localServerUrl = '';

let mobileServer = null;

let mobileServerPort = 3000;

const priceStreamClients = new Set();

let livePrices = null;

const DEFAULT_PUBLIC_WEB_URL = 'https://tiemvangkimbaolam.id.vn';

const lanPawnPending = new Map();

let lanPawnRequestSeq = 0;

const LAN_PAWN_SESSION_TOKEN = crypto.randomBytes(24).toString('hex');

// Bảng giá dùng một giá bán chuẩn 9999. Các loại còn lại dùng tuổi quy đổi

// theo bảng tiệm: 980→985, 750→765, 610→622, 585→600, 416→430.

// Giá mua = giá bán - chênh lệch riêng từng loại.

// Giá chênh lệch nhập 400 được hiểu là 400.000đ; nhập 400000 cũng được.

const GOLD_PRICE_RULES = [

    { code: '9999', title: 'Vàng 9999', effective: 9999 },

    { code: '980', title: 'Vàng 980', effective: 9850 },

    { code: '750', title: 'Vàng 750 / 18K', effective: 7650 },

    { code: '610', title: 'Vàng 610', effective: 6220 },

    { code: '585', title: 'Vàng 585 / 14K', effective: 6000 },

    { code: '416', title: 'Vàng 416 / 10K', effective: 4300 }

];

const PUBLIC_SYNC_TIMEOUT_MS = 8000;



// ================================================================

// KBL N10.1 - GOOGLE SHEET AUTO PRICE (BK / ASK)

// Nguồn cố định theo bảng giá chủ tiệm cung cấp.

// ASK ví dụ 145,054 -> 145054 -> bỏ 1 số cuối = 14505

// -> 14.505.000đ/chỉ. Sau đó cộng mức điều chỉnh (mặc định +100.000đ).

// ================================================================

const GOOGLE_PRICE_RELAY_DEFAULT_URL = 'https://script.google.com/macros/s/AKfycbxTpmcPTF6kgUbraMyeaxR-uVIh9U7ePKXYfcSLZZeRJ6l5tk5vA4aau3VHMw9iGfZm/exec';

const GOOGLE_PRICE_SOURCE = Object.freeze({

    // Sheet nguồn vẫn cố định ở Apps Script; POS chỉ gọi relay đã xác thực.

    symbol: 'BK',

    pollMs: 12000,

    fetchTimeoutMs: 8000

});

let googlePricePollTimer = null;

let googlePricePollBusy = false;

let googlePricePollStopped = false;

let googlePriceInitialSyncDone = false;

let googleCloudConfigLastSignature = '';

let googleCloudConfigLastSyncAt = 0;

let googlePriceRuntimeStatus = {

    enabled: true,

    busy: false,

    symbol: GOOGLE_PRICE_SOURCE.symbol,

    bidRaw: '',

    askRaw: '',

    askNumber: 0,

    sourceBaseVnd: 0,

    markupVnd: 100000,

    finalSell9999: 0,

    lastCheckAt: '',

    lastSuccessAt: '',

    lastChangedAt: '',

    webSyncOk: null,

    message: 'Chưa quét Google Sheet.',

    error: ''

};



const PRICE_KEYS = GOLD_PRICE_RULES.flatMap(({ code }) => [

    `price_buy_${code}`,

    `price_sell_${code}`,

    `spread_${code}`

]);



function roundGoldPrice(value) {

    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) return 0;

    return Math.round(number / 10000) * 10000;

}



function normalizeSpread(value) {

    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) return 0;

    return number > 0 && number < 10000 ? number * 1000 : Math.round(number);

}



function derivePriceState(source) {

    const input = source && typeof source === 'object' ? source : {};

    const baseSell = Math.max(0, Number(input.price_sell_9999) || 0);

    // 9999 giữ đúng giá gốc đến 1.000đ (ví dụ 14.605.000đ).

    // Chỉ các tuổi còn lại mới tiếp tục dùng công thức cũ và làm tròn 10.000đ.

    const result = { price_sell_9999: Math.round(baseSell / 1000) * 1000 };

    for (const rule of GOLD_PRICE_RULES) {

        const sell = rule.code === '9999'

            ? result.price_sell_9999

            : roundGoldPrice(result.price_sell_9999 * rule.effective / 9999);

        const oldSell = Number(input[`price_sell_${rule.code}`]);

        const oldBuy = Number(input[`price_buy_${rule.code}`]);

        let spread = input[`spread_${rule.code}`] !== undefined

            ? normalizeSpread(input[`spread_${rule.code}`])

            : (Number.isFinite(oldSell) && Number.isFinite(oldBuy) ? Math.max(0, oldSell - oldBuy) : 0);

        result[`spread_${rule.code}`] = spread;

        result[`price_sell_${rule.code}`] = sell;

        result[`price_buy_${rule.code}`] = Math.max(0, sell - spread);

    }

    return result;

}

// ----------------------------------



// ==========================================

// THÊM KHỐI TẠO TRẠM QUÉT CCCD TỪ ĐIỆN THOẠI

// ==========================================

function getNetworkIPv4s() {

    let interfaces = {};

    try {

        interfaces = os.networkInterfaces() || {};

    } catch (_) {

        return [];

    }

    const addresses = [];

    for (const name of Object.keys(interfaces)) {

        for (const iface of (interfaces[name] || [])) {

            const isIPv4 = iface.family === 'IPv4' || iface.family === 4;

            if (isIPv4 && !iface.internal && iface.address && !addresses.includes(iface.address)) {

                addresses.push(iface.address);

            }

        }

    }

    return addresses;

}



function getLocalIP() {
    const addresses = getNetworkIPv4s();
    const exactShopLan = addresses.find((address) => address === '192.168.1.9');
    const preferred192 = exactShopLan || addresses.find((address) => address.startsWith('192.168.'));
    const preferred10 = addresses.find((address) => address.startsWith('10.'));
    const preferred172 = addresses.find((address) => /^172\.(1[6-9]|2\d|3[01])\./.test(address));
    return preferred192 || preferred10 || preferred172 || addresses[0] || 'localhost';
}



function getCurrentServerUrl() {

    return 'http://' + getLocalIP() + ':' + mobileServerPort;

}



function getDataFilePath(fileName) {

    const cwdPath = path.join(process.cwd(), fileName);

    if (fs.existsSync(cwdPath)) return cwdPath;

    return path.join(__dirname, fileName);

}



function readSettingsObject() {

    try {

        const filePath = getDataFilePath('settings.json');

        return JSON.parse(fs.readFileSync(filePath, 'utf-8').trim() || '{}');

    } catch (_) {

        return {};

    }

}



function getPriceState() {

    const source = livePrices || readSettingsObject();

    return derivePriceState(source);

}



function normalizePricePayload(payload) {

    const candidate = payload && payload.prices && typeof payload.prices === 'object'

        ? payload.prices

        : payload;

    if (!candidate || typeof candidate !== 'object') return null;



    const prices = {};

    PRICE_KEYS.concat(['price_sell_9999']).forEach((key) => {

        if (candidate[key] === undefined || candidate[key] === null || candidate[key] === '') return;

        const value = Number(candidate[key]);

        if (Number.isFinite(value) && value >= 0) prices[key] = value;

    });

    return Object.keys(prices).length ? prices : null;

}



function mergePriceState(payload) {

    const incoming = normalizePricePayload(payload);

    if (!incoming) return null;

    livePrices = derivePriceState({ ...getPriceState(), ...incoming });

    return livePrices;

}



function persistPriceState(prices) {

    const filePath = getDataFilePath('settings.json');

    const settings = readSettingsObject();

    fs.writeFileSync(filePath, JSON.stringify({ ...settings, ...prices }, null, 2), 'utf-8');

}



function getPublicWebSyncConfig() {

    const settings = readSettingsObject();

    const savedLink = require('./kbl-connection.cjs').read();
    if (savedLink) return savedLink;
    const url = String(settings.web_sync_url || process.env.KBL_WEB_SYNC_URL || DEFAULT_PUBLIC_WEB_URL).trim().replace(/\/$/, '');

    const token = String(settings.web_sync_token || process.env.KBL_WEB_SYNC_TOKEN || process.env.KBL_SYNC_TOKEN || process.env.KBL_REMOTE_TOKEN || '').trim();

    return { url, token };

}



async function syncPublicWeb(pathname, body, overrideConfig = null) {

    const config = overrideConfig && typeof overrideConfig === 'object'

        ? {

            url: String(overrideConfig.url || '').trim().replace(/\/$/, ''),

            token: String(overrideConfig.token || '').trim()

        }

        : getPublicWebSyncConfig();

    if (!config.url) return { success: false, reason: 'missing-url', message: 'Chưa có địa chỉ website.' };

    if (!config.token) return { success: false, reason: 'missing-token', message: 'Chưa có mã đồng bộ website (KBL_SYNC_TOKEN).' };

    if (typeof fetch !== 'function') return { success: false, reason: 'fetch-unavailable', message: 'Môi trường Electron không có fetch.' };

    const controller = typeof AbortController === 'function' ? new AbortController() : null;

    const timeout = setTimeout(() => controller?.abort(), PUBLIC_SYNC_TIMEOUT_MS);

    try {

        const response = await fetch(config.url + pathname, {

            method: 'POST',

            headers: { 'Content-Type': 'application/json', ...(config.token ? { 'X-KBL-Sync-Token': config.token } : {}) },

            body: JSON.stringify(body),

            ...(controller ? { signal: controller.signal } : {})

        });

        let responseData = null;

        try { responseData = await response.json(); } catch (_) {}

        if (!response.ok) {

            const message = response.status === 401

                ? 'Mã đồng bộ không đúng với KBL_SYNC_TOKEN trên hosting.'

                : (responseData && responseData.message ? String(responseData.message) : `Website trả về lỗi HTTP ${response.status}.`);

            console.warn('⚠️ Đồng bộ web không thành công:', response.status);

            return { ...(responseData && typeof responseData === 'object' ? responseData : {}), success: false, reason: 'http-error', status: response.status, message };

        }

        return {

            ...(responseData && typeof responseData === 'object' ? responseData : {}),

            success: true,

            status: response.status,

            message: responseData && responseData.message ? String(responseData.message) : 'Đã đồng bộ website.'

        };

    } catch (error) {

        console.warn('⚠️ Chưa đồng bộ được web:', error.message);

        const message = error?.name === 'AbortError'

            ? `Website không phản hồi trong ${PUBLIC_SYNC_TIMEOUT_MS / 1000} giây.`

            : 'Không kết nối được website: ' + error.message;

        return { success: false, reason: error?.name === 'AbortError' ? 'timeout' : 'network-error', message };

    } finally {

        clearTimeout(timeout);

    }

}



function syncPricesToPublicWeb(prices) { return syncPublicWeb('/api/sync/prices', { prices }); }



async function syncCloudPriceConfigToPublicWeb(config, force = false) {

    const safe = config && typeof config === 'object' ? config : getGooglePriceConfig();

    const payload = {

        enabled: safe.enabled !== false,

        markupVnd: normalizeGoogleMarkupVnd(safe.markupVnd),

        relayUrl: String(safe.relayUrl || GOOGLE_PRICE_RELAY_DEFAULT_URL).trim(),

        relayToken: String(safe.relayToken || '').trim(),

        pollMs: GOOGLE_PRICE_SOURCE.pollMs,

        symbol: GOOGLE_PRICE_SOURCE.symbol

    };

    if (!payload.relayToken) return { success: false, reason: 'missing-relay-token', message: 'Chưa có mã Google Relay để bàn giao Cloud.' };

    const signature = cryptoSafeSignature(JSON.stringify(payload));

    if (!force && signature === googleCloudConfigLastSignature && Date.now() - googleCloudConfigLastSyncAt < 5 * 60 * 1000) {

        return { success: true, skipped: true, message: 'Cloud config không đổi.' };

    }

    const result = await syncPublicWeb('/api/sync/cloud-price-config', { config: payload });

    if (result && result.success) {

        googleCloudConfigLastSignature = signature;

        googleCloudConfigLastSyncAt = Date.now();

    }

    return result;

}

function cryptoSafeSignature(text) {

    // Chỉ dùng để phát hiện cấu hình có đổi trong RAM, không phải hàm bảo mật.

    let hash = 2166136261;

    for (let i = 0; i < String(text).length; i++) {

        hash ^= String(text).charCodeAt(i);

        hash = Math.imul(hash, 16777619);

    }

    return (hash >>> 0).toString(16);

}



function normalizeGoogleMarkupVnd(value) {

    const number = Number(value);

    if (!Number.isFinite(number)) return 100000;

    return Math.max(0, Math.min(5000000, Math.round(number / 1000) * 1000));

}



function getGooglePriceConfig() {

    const settings = readSettingsObject();

    return {

        enabled: settings.google_price_auto_enabled !== false,

        markupVnd: normalizeGoogleMarkupVnd(

            settings.google_price_markup_vnd === undefined ? 100000 : settings.google_price_markup_vnd

        ),

        relayUrl: String(settings.google_price_relay_url || GOOGLE_PRICE_RELAY_DEFAULT_URL).trim(),

        relayToken: String(settings.google_price_relay_token || '').trim()

    };

}



function parseGoogleAskNumber(value) {

    // Bảng nguồn dùng dấu phẩy ngăn hàng nghìn: 145,054 -> 145054.

    const normalized = String(value ?? '').trim().replace(/\s+/g, '').replace(/,/g, '');

    if (!/^[-+]?\d+(?:\.\d+)?$/.test(normalized)) return 0;

    const number = Number(normalized);

    return Number.isFinite(number) && number > 0 ? number : 0;

}



function googleAskToBaseVnd(askNumber) {

    // Quy tắc chủ tiệm: bỏ chữ số cuối rồi hiểu theo nghìn đồng/chỉ.

    // 145054 -> 14505 -> 14.505.000đ/chỉ.

    const source = Math.floor(Number(askNumber) || 0);

    if (source <= 0) return 0;

    return Math.floor(source / 10) * 1000;

}



function buildGoogleRelayUrl(relayUrl, relayToken) {

    const url = new URL(String(relayUrl || '').trim());

    if (!/^https:\/\/script\.google\.com\/macros\/s\//i.test(url.href)) {

        throw new Error('URL relay phải là Web App Google Apps Script dạng https://script.google.com/macros/s/.../exec');

    }

    url.searchParams.set('token', String(relayToken || '').trim());

    url.searchParams.set('_', String(Date.now()));

    return url.href;

}



async function fetchJsonWithTimeout(url, timeoutMs) {

    if (typeof fetch !== 'function') throw new Error('Electron hiện tại không có fetch để gọi Apps Script.');

    const controller = typeof AbortController === 'function' ? new AbortController() : null;

    const timeout = setTimeout(() => controller?.abort(), timeoutMs);

    try {

        const response = await fetch(url, {

            method: 'GET',

            redirect: 'follow',

            cache: 'no-store',

            headers: {

                'Accept': 'application/json',

                'Cache-Control': 'no-cache, no-store, max-age=0',

                'Pragma': 'no-cache'

            },

            ...(controller ? { signal: controller.signal } : {})

        });

        if (!response.ok) throw new Error(`Google Apps Script trả HTTP ${response.status}.`);

        const text = await response.text();

        if (/<!doctype\s+html|<html[\s>]/i.test(text)) {

            throw new Error('Apps Script trả về trang HTML thay vì JSON. Kiểm tra lại URL /exec và quyền triển khai Anyone.');

        }

        let data;

        try { data = JSON.parse(text); } catch (_) {

            throw new Error('Apps Script trả dữ liệu không phải JSON hợp lệ.');

        }

        return data;

    } finally {

        clearTimeout(timeout);

    }

}



async function fetchGoogleBkAsk() {

    const config = getGooglePriceConfig();

    if (!config.relayUrl) throw new Error('Chưa nhập URL Google Apps Script Relay trong Cài đặt & AI.');

    if (!config.relayToken) throw new Error('Chưa có mã bí mật Google Relay.');

    const url = buildGoogleRelayUrl(config.relayUrl, config.relayToken);

    const data = await fetchJsonWithTimeout(url, GOOGLE_PRICE_SOURCE.fetchTimeoutMs);

    if (!data || data.status !== 'success') {

        const message = data && data.message ? String(data.message) : 'Relay không trả trạng thái success.';

        throw new Error(`Google Relay: ${message}`);

    }

    const symbol = String(data.symbol || '').trim().toUpperCase();

    if (symbol && symbol !== GOOGLE_PRICE_SOURCE.symbol) {

        throw new Error(`Relay trả sai mã ${symbol}; POS đang chờ ${GOOGLE_PRICE_SOURCE.symbol}.`);

    }

    const bidRaw = String(data.bid ?? '').trim();

    const askRaw = String(data.ask ?? '').trim();

    const askNumber = parseGoogleAskNumber(askRaw);

    if (!askNumber) throw new Error(`Giá ASK của ${GOOGLE_PRICE_SOURCE.symbol} không hợp lệ: ${askRaw || '(trống)'}`);

    return { bidRaw, askRaw, askNumber };

}



function sendGooglePriceStatus() {

    if (mainWindow && !mainWindow.isDestroyed()) {

        mainWindow.webContents.send('google-price-status', { ...googlePriceRuntimeStatus });

    }

}



function getGooglePriceStatus() {

    const config = getGooglePriceConfig();

    return { ...googlePriceRuntimeStatus, enabled: config.enabled, markupVnd: config.markupVnd, relayConfigured: Boolean(config.relayUrl && config.relayToken), symbol: GOOGLE_PRICE_SOURCE.symbol };

}



async function pollGooglePrice(reason = 'timer') {

    const config = getGooglePriceConfig();

    googlePriceRuntimeStatus.enabled = config.enabled;

    googlePriceRuntimeStatus.markupVnd = config.markupVnd;

    googlePriceRuntimeStatus.lastCheckAt = new Date().toISOString();

    googlePriceRuntimeStatus.error = '';



    if (!config.enabled) {

        googlePriceRuntimeStatus.busy = false;

        googlePriceRuntimeStatus.message = 'Tự động lấy giá Google Sheet đang TẮT.';

        sendGooglePriceStatus();

        return getGooglePriceStatus();

    }

    if (googlePricePollBusy) return getGooglePriceStatus();



    googlePricePollBusy = true;

    googlePriceRuntimeStatus.busy = true;

    googlePriceRuntimeStatus.message = 'Đang đọc BK / ASK qua Google Apps Script Relay...';

    sendGooglePriceStatus();



    try {

        // Bàn giao Relay + mức cộng cho Plesk. Sau lần này, Cloud tự chạy kể cả khi POS/máy tính tắt.

        await syncCloudPriceConfigToPublicWeb(config, reason === 'manual' || !googlePriceInitialSyncDone);

        const { bidRaw, askRaw, askNumber } = await fetchGoogleBkAsk();

        const sourceBaseVnd = googleAskToBaseVnd(askNumber);

        const finalSell9999 = Math.round((sourceBaseVnd + config.markupVnd) / 1000) * 1000;

        if (sourceBaseVnd < 1000000 || sourceBaseVnd > 100000000) {

            throw new Error(`Giá quy đổi bất thường (${sourceBaseVnd.toLocaleString('vi-VN')}đ/chỉ), POS giữ nguyên giá cũ.`);

        }

        if (finalSell9999 < 1000000 || finalSell9999 > 100000000) {

            throw new Error('Giá 9999 sau khi cộng điều chỉnh nằm ngoài vùng an toàn.');

        }



        const current = Number(getPriceState().price_sell_9999) || 0;

        if (current > 0) {

            const jumpRatio = Math.abs(finalSell9999 - current) / current;

            if (jumpRatio > 0.35) {

                throw new Error(`Nguồn mới lệch ${(jumpRatio * 100).toFixed(1)}% so với giá POS; hệ thống chặn tự động để tránh nhảy giá sai.`);

            }

        }



        googlePriceRuntimeStatus.bidRaw = bidRaw;

        googlePriceRuntimeStatus.askRaw = askRaw;

        googlePriceRuntimeStatus.askNumber = askNumber;

        googlePriceRuntimeStatus.sourceBaseVnd = sourceBaseVnd;

        googlePriceRuntimeStatus.finalSell9999 = finalSell9999;

        googlePriceRuntimeStatus.lastSuccessAt = new Date().toISOString();



        const priceChanged = current !== finalSell9999;

        const shouldPush = priceChanged || !googlePriceInitialSyncDone || googlePriceRuntimeStatus.webSyncOk === false || reason === 'manual';

        if (shouldPush) {

            livePrices = derivePriceState({ ...getPriceState(), price_sell_9999: finalSell9999 });

            persistPriceState(livePrices);

            const eventPayload = broadcastPriceState('google-sheet');

            if (mainWindow && !mainWindow.isDestroyed()) {

                // Dùng đúng handler hiện có ở renderer để POS lưu về AppData và cập nhật UI.

                mainWindow.webContents.send('remote-prices-received', eventPayload);

            }

            const webResult = await syncPricesToPublicWeb(livePrices);

            googlePriceRuntimeStatus.webSyncOk = Boolean(webResult && webResult.success);

            googlePriceInitialSyncDone = true;

            if (priceChanged) googlePriceRuntimeStatus.lastChangedAt = new Date().toISOString();

            googlePriceRuntimeStatus.message = priceChanged

                ? `Đã cập nhật 9999 từ Google Sheet và đồng bộ POS / TV / Web (${reason}).`

                : (webResult && webResult.success

                    ? 'Giá không đổi; đã kiểm tra và đảm bảo Web/TV nhận bảng giá hiện tại.'

                    : `Giá không đổi; Web chưa nhận được: ${(webResult && webResult.message) || 'không rõ lỗi'}`);

        } else {

            googlePriceRuntimeStatus.message = 'Google Sheet không đổi giá; không đồng bộ lại để tránh spam.';

        }

        sendGooglePriceStatus();

        return getGooglePriceStatus();

    } catch (error) {

        googlePriceRuntimeStatus.error = error?.name === 'AbortError'

            ? 'Hết thời gian chờ Google Sheet.'

            : (error?.message || String(error));

        googlePriceRuntimeStatus.message = 'Không áp dụng giá mới; POS giữ nguyên bảng giá hiện tại.';

        sendGooglePriceStatus();

        return getGooglePriceStatus();

    } finally {

        googlePricePollBusy = false;

        googlePriceRuntimeStatus.busy = false;

        sendGooglePriceStatus();

    }

}



function scheduleGooglePricePoll(delayMs = 1200) {

    if (googlePricePollStopped) return;

    clearTimeout(googlePricePollTimer);

    googlePricePollTimer = setTimeout(async () => {

        try { await pollGooglePrice('timer'); } catch (_) {}

        scheduleGooglePricePoll(GOOGLE_PRICE_SOURCE.pollMs);

    }, Math.max(500, Number(delayMs) || GOOGLE_PRICE_SOURCE.pollMs));

}



async function syncInventoryToPublicWeb() {

    try {

        const filePath = getDataFilePath('inventory_db.json');

        if (!fs.existsSync(filePath)) return { success: false, reason: 'missing-inventory', message: 'Chưa có file kho inventory_db.json.' };

        const inventory = JSON.parse(fs.readFileSync(filePath, 'utf8') || '[]');

        if (!Array.isArray(inventory)) return { success: false, reason: 'invalid-inventory', message: 'Dữ liệu kho không hợp lệ.' };

        return await syncPublicWeb('/api/sync/inventory', {

            inventory,

            mode: 'snapshot',

            schemaVersion: 2,

            sentAt: new Date().toISOString()

        });

    } catch (error) {

        return { success: false, reason: 'inventory-read-error', message: 'Không đọc được kho để đồng bộ: ' + error.message };

    }

}



function broadcastPriceState(source) {

    const payload = {

        type: 'prices',

        prices: getPriceState(),

        updatedAt: new Date().toISOString(),

        source: source || 'app'

    };

    const message = 'event: prices\n' + 'data: ' + JSON.stringify(payload) + '\n\n';

    for (const client of Array.from(priceStreamClients)) {

        try {

            client.write(message);

        } catch (_) {

            priceStreamClients.delete(client);

        }

    }

    return payload;

}



function getPriceBoardInfo() {
    const preferredIp = getLocalIP();
    const addresses = getNetworkIPv4s();
    const orderedIps = [preferredIp, ...addresses.filter((ip) => ip !== preferredIp)]
        .filter((ip, index, list) => ip && ip !== 'localhost' && list.indexOf(ip) === index);
    const baseUrls = orderedIps.map((ip) => 'http://' + ip + ':' + mobileServerPort);
    if (!baseUrls.length) baseUrls.push(getCurrentServerUrl());
    const baseUrl = baseUrls[0];
    return {
        baseUrl,
        tvUrl: baseUrl + '/tv',
        priceUrl: baseUrl + '/price',
        scannerUrl: baseUrl + '/',
        allBaseUrls: baseUrls,
        port: mobileServerPort
    };
}





function normalizeLanRemoteAddress(value) {

    return String(value || '').trim().toLowerCase().replace(/^::ffff:/, '');

}



function isPrivateLanRemoteAddress(value) {

    const ip = normalizeLanRemoteAddress(value);

    if (!ip) return false;

    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;

    if (/^10\./.test(ip) || /^192\.168\./.test(ip)) return true;

    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;

    if (/^(?:fc|fd|fe80):/i.test(ip)) return true;

    return false;

}



function lanPawnCookieIsValid(req) {

    const cookie = String(req && req.headers && req.headers.cookie || '');

    const match = cookie.match(/(?:^|;\s*)kbl_lan_pawn=([a-f0-9]{48})(?:;|$)/i);

    if (!match) return false;

    try {

        const a = Buffer.from(match[1], 'utf8');

        const b = Buffer.from(LAN_PAWN_SESSION_TOKEN, 'utf8');

        return a.length === b.length && crypto.timingSafeEqual(a, b);

    } catch (_) {

        return false;

    }

}



function setLanPawnSessionCookie(res) {

    res.setHeader('Set-Cookie', `kbl_lan_pawn=${LAN_PAWN_SESSION_TOKEN}; Path=/; HttpOnly; SameSite=Strict`);

    res.setHeader('Cache-Control', 'no-store');

}



function requestPawnLan(action, payload = {}, timeoutMs = 6500) {

    return new Promise((resolve) => {

        if (!mainWindow || mainWindow.isDestroyed()) {

            resolve({ success: false, message: 'POS chưa sẵn sàng để đọc kho cầm.' });

            return;

        }

        const requestId = `lanpawn_${Date.now().toString(36)}_${(++lanPawnRequestSeq).toString(36)}`;

        const timer = setTimeout(() => {

            lanPawnPending.delete(requestId);

            resolve({ success: false, message: 'Tab Cầm Đồ chưa phản hồi. Hãy mở Tab 2 Cầm Đồ trên POS rồi thử lại.' });

        }, Math.max(1500, Number(timeoutMs) || 6500));

        lanPawnPending.set(requestId, { resolve, timer });

        try {

            mainWindow.webContents.send('lan-pawn-request', {

                requestId,

                action: String(action || '').trim(),

                payload: payload && typeof payload === 'object' ? payload : {}

            });

        } catch (error) {

            clearTimeout(timer);

            lanPawnPending.delete(requestId);

            resolve({ success: false, message: error?.message || 'Không gửi được yêu cầu tới Tab Cầm Đồ.' });

        }

    });

}



function sendLanPawnJson(res, result) {

    const payload = result && typeof result === 'object'

        ? result

        : { success: false, message: 'Phản hồi phiếu cầm không hợp lệ.' };

    res.status(payload.success ? 200 : 400).json(payload);

}



function startMobileScannerServer() {

    if (mobileServer) return;

    const appExpress = express();

    appExpress.use(cors());

    appExpress.use(express.json({ limit: '50mb' }));



    const port = 3000;

    mobileServerPort = port;

    localServerUrl = `http://${getLocalIP()}:${port}`;



    appExpress.get('/tv', (_req, res) => {

        res.sendFile(path.join(__dirname, 'tv.html'));

    });



    appExpress.get('/price', (_req, res) => {

        setLanPawnSessionCookie(res);

        res.sendFile(path.join(__dirname, 'mobile-price.html'));

    });



    appExpress.get('/api/health', (_req, res) => {

        res.json({ success: true, service: 'KimBaoLam POS LAN', port: mobileServerPort });

    });



    // KBL POS LAN: nghiệp vụ phiếu cầm chỉ nhận từ thiết bị trong mạng nội bộ.

    // Website công khai không có route ghi ngược vào kho cầm trên máy POS.

    appExpress.use('/api/pawn-lan', (req, res, next) => {

        const remoteAddress = req.socket?.remoteAddress || req.ip || '';

        if (!isPrivateLanRemoteAddress(remoteAddress)) {

            res.status(403).json({ success: false, message: 'Chức năng phiếu cầm chỉ dùng trong mạng LAN của tiệm.' });

            return;

        }

        if (!lanPawnCookieIsValid(req)) {

            res.status(403).json({ success: false, message: 'Phiên Remote LAN chưa hợp lệ. Hãy mở lại /price trực tiếp từ QR LAN của POS.' });

            return;

        }

        res.setHeader('Cache-Control', 'no-store');

        next();

    });



    appExpress.get('/api/pawn-lan/lookup', async (req, res) => {

        const query = String(req.query.q || req.query.code || req.query.token || '').trim();

        if (!query) {

            res.status(400).json({ success: false, message: 'Chưa có mã phiếu hoặc QR.' });

            return;

        }

        sendLanPawnJson(res, await requestPawnLan('lookup', { query }));

    });



    appExpress.post('/api/pawn-lan/interest-payment', async (req, res) => {

        const query = String(req.body?.query || req.body?.code || '').trim();

        if (!query) {

            res.status(400).json({ success: false, message: 'Chưa có mã phiếu.' });

            return;

        }

        sendLanPawnJson(res, await requestPawnLan('interest-payment', { query }));

    });



    appExpress.post('/api/pawn-lan/redeem', async (req, res) => {

        const query = String(req.body?.query || req.body?.code || '').trim();

        if (!query) {

            res.status(400).json({ success: false, message: 'Chưa có mã phiếu.' });

            return;

        }

        sendLanPawnJson(res, await requestPawnLan('redeem', { query }));

    });



    appExpress.post('/api/pawn-lan/print-receipt', async (req, res) => {

        const query = String(req.body?.query || req.body?.code || '').trim();

        const transactionId = String(req.body?.transactionId || '').trim();

        if (!query || !transactionId) {

            res.status(400).json({ success: false, message: 'Thiếu mã phiếu hoặc mã giao dịch để in.' });

            return;

        }

        sendLanPawnJson(res, await requestPawnLan('print-receipt', { query, transactionId }, 10000));

    });



    appExpress.get('/api/prices', (_req, res) => {

        res.json({

            success: true,

            prices: getPriceState(),

            updatedAt: new Date().toISOString()

        });

    });



    appExpress.get('/api/prices/stream', (req, res) => {

        res.status(200);

        res.set({

            'Content-Type': 'text/event-stream',

            'Cache-Control': 'no-cache, no-transform',

            'Connection': 'keep-alive',

            'Access-Control-Allow-Origin': '*'

        });

        if (typeof res.flushHeaders === 'function') res.flushHeaders();

        priceStreamClients.add(res);

        const initial = {

            type: 'prices',

            prices: getPriceState(),

            updatedAt: new Date().toISOString(),

            source: 'initial'

        };

        res.write('event: prices\n' + 'data: ' + JSON.stringify(initial) + '\n\n');

        const keepAlive = setInterval(() => {

            try {

                res.write(': keep-alive\n\n');

            } catch (_) {

                clearInterval(keepAlive);

                priceStreamClients.delete(res);

            }

        }, 20000);

        req.on('close', () => {

            clearInterval(keepAlive);

            priceStreamClients.delete(res);

        });

    });



    appExpress.post('/api/prices', (req, res) => {

        const nextPrices = mergePriceState(req.body);

        if (!nextPrices) {

            res.status(400).json({ success: false, message: 'Dữ liệu bảng giá không hợp lệ.' });

            return;

        }

        try {

            persistPriceState(nextPrices);

        } catch (error) {

            res.status(500).json({ success: false, message: 'Không thể lưu bảng giá: ' + error.message });

            return;

        }

        syncPricesToPublicWeb(nextPrices);

        const eventPayload = broadcastPriceState('remote');

        if (mainWindow && !mainWindow.isDestroyed()) {

            mainWindow.webContents.send('remote-prices-received', eventPayload);

        }

        res.json({ success: true, ...eventPayload });

    });



    // Một trang điều khiển chung: Quét CCCD (mặt trước + mặt sau) và bảng giá TV.

    // Giữ luôn các URL cũ /?side=front, /?side=back và /price để không làm hỏng QR/link đã tạo trước đó.

    appExpress.get(['/', '/remote'], (_req, res) => {

        setLanPawnSessionCookie(res);

        res.sendFile(path.join(__dirname, 'mobile-price.html'));

    });



    appExpress.post('/upload', (req, res) => {

        const { side, image } = req.body;

        if (mainWindow && !mainWindow.isDestroyed()) {

            mainWindow.webContents.send('mobile-cccd-received', { side, image });

        }

        res.json({ success: true });

    });



    const onServerReady = () => {

        const address = mobileServer && mobileServer.address();

        if (address && typeof address === 'object' && address.port) {

            mobileServerPort = address.port;

        }

        localServerUrl = getCurrentServerUrl();

        console.log('✅ Mobile/TV LAN Server ready at:', localServerUrl);

    };



    mobileServer = appExpress.listen(port, '0.0.0.0', onServerReady);

    mobileServer.once('error', (error) => {

        if (error && error.code === 'EADDRINUSE' && mobileServerPort === port) {

            console.warn('⚠️ Cổng 3000 đang bận, chuyển sang cổng LAN dự phòng.');

            try { mobileServer.close(); } catch (_) {}

            mobileServer = appExpress.listen(0, '0.0.0.0', onServerReady);

            mobileServer.once('error', (fallbackError) => {

                console.error('❌ Không thể khởi động máy chủ LAN:', fallbackError);

                mobileServer = null;

            });

            return;

        }

        console.error('❌ Không thể khởi động máy chủ LAN:', error);

        mobileServer = null;

    });

}

// ==========================================





// KBL 15/09/2026: label-only print window. Invoice and website paths stay unchanged.

async function printGoldLabelHtml(html, deviceName, pageSize, copies) {

    const printWindow = new BrowserWindow({

        show:false, useContentSize:true,

        width:Math.ceil(pageSize.width / 1000 * 96 / 25.4),

        height:Math.ceil(pageSize.height / 1000 * 96 / 25.4),

        webPreferences:{nodeIntegration:false,contextIsolation:true,zoomFactor:1,backgroundThrottling:false}

    });

    try {

        await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

        printWindow.webContents.setZoomFactor(1);

        const ready = await printWindow.webContents.executeJavaScript(`(async () => {

            const check = async () => {

                await document.fonts.ready;

                await Promise.all(Array.from(document.images).map(async image => {

                    if (image.decode) await image.decode();

                    if (!image.complete || !image.naturalWidth) throw new Error('Ảnh QR chưa sẵn sàng.');

                }));

                const page = document.querySelector('.label-page');

                if (!page) throw new Error('Thiếu khung trang in tem.');

                const bounds = page.getBoundingClientRect();

                const tolerance = .2;

                const outside = Array.from(document.querySelectorAll('.tag-left-data,.tag-left-qr,.tag-right-meta')).some(node => {

                    const b = node.getBoundingClientRect();

                    return b.left < bounds.left - tolerance || b.top < bounds.top - tolerance || b.right > bounds.right + tolerance || b.bottom > bounds.bottom + tolerance;

                });

                if (outside) throw new Error('Nội dung vượt khung trang. Bấm Về khung rồi In khung 1 để căn lại X/Y.');

                const clipped = Array.from(document.querySelectorAll('.t-row > :last-child,.t-code-line')).some(node => node.scrollWidth > node.clientWidth + 1);

                if (clipped) throw new Error('Dòng số hoặc Mã SP quá dài so với tem. Chưa in để tránh cắt mất thông tin.');

                return {success:true};

            };

            let timer;

            try {

                return await Promise.race([check(),new Promise((_,reject) => {timer=setTimeout(() => reject(new Error('Chưa tải xong nội dung tem sau 10 giây.')),10000);})]);

            } catch (e) {return {success:false,failureReason:e.message || String(e)};}

            finally {clearTimeout(timer);}

        })()`);

        if (!ready || !ready.success) return ready || {success:false,failureReason:'Không kiểm tra được khung in.'};

        return await new Promise((resolve) => {

            const timer = setTimeout(() => resolve({success:false,failureReason:'Máy in chưa trả kết quả sau 30 giây. Kiểm tra hàng đợi trước khi in lại; không tự gửi lại lệnh.'}),30000);

            const finish = (success,reason) => {clearTimeout(timer);resolve({success,failureReason:reason || ''});};

            try {

                const options = {silent:true,printBackground:true,margins:{marginType:'none'},scaleFactor:100,

                    pageSize,landscape:false,copies,pagesPerSheet:1,duplexMode:'simplex'};

                if (deviceName) options.deviceName = deviceName;

                printWindow.webContents.print(options,finish);

            } catch (error) {finish(false,error?.message || String(error));}

        });

    } catch (error) {return {success:false,failureReason:error?.message || String(error)};}

    finally {if (!printWindow.isDestroyed()) printWindow.destroy();}

}



async function printHtml(html, deviceName, pageSize, silentMode = true, printControl = {}) {

    const printWindow = new BrowserWindow({

        show: false,

        webPreferences: {

            nodeIntegration: false,

            contextIsolation: true

        }

    });



    try {

        await printWindow.loadURL(

            'data:text/html;charset=utf-8,' + encodeURIComponent(html)

        );



        return await new Promise((resolve) => {

            const printOptions = {

                silent: silentMode === true,

                printBackground: true,

                margins: { marginType: 'none' },

                scaleFactor: 100

            };

            const requestedCopies = Math.max(1, Math.min(99, Math.floor(Number(printControl && printControl.copies) || 1)));

            printOptions.copies = requestedCopies;

            if (printControl && printControl.usePrinterDefaultPageSize === true) {

                printOptions.usePrinterDefaultPageSize = true;

            } else if (pageSize) {

                printOptions.pageSize = pageSize;

            }

            if (!(printControl && printControl.omitLandscapeOverride === true)) {

                printOptions.landscape = false;

            }

            // Tem dùng máy đã chọn và in im lặng. Hóa đơn bán hàng mở hộp thoại hệ thống mỗi lần để người dùng tự kiểm tra máy/khổ giấy.

            if (silentMode === true && deviceName) printOptions.deviceName = deviceName;



            printWindow.webContents.print(printOptions, (success, failureReason) => {

                resolve({ success, failureReason: failureReason || '' });

            });

        });

    } catch (error) {

        return { success: false, failureReason: error?.message || String(error) };

    } finally {

        if (!printWindow.isDestroyed()) printWindow.destroy();

    }

}



function registerIpcHandlers() {

    if (ipcRegistered) return;

    ipcRegistered = true;



    ipcMain.on('lan-pawn-response', (_event, message) => {

        const requestId = String(message && message.requestId || '').trim();

        const pending = lanPawnPending.get(requestId);

        if (!pending) return;

        clearTimeout(pending.timer);

        lanPawnPending.delete(requestId);

        pending.resolve(message && message.result && typeof message.result === 'object'

            ? message.result

            : { success: false, message: 'Tab Cầm Đồ trả về dữ liệu không hợp lệ.' });

    });



    // --- THÊM IPC CHO MÃ QR TRÊN GIAO DIỆN ---

    ipcMain.handle('get-scanner-url', () => localServerUrl);

    ipcMain.handle('get-price-board-info', () => getPriceBoardInfo());

    ipcMain.handle('get-web-sync-status', () => {

        const config = getPublicWebSyncConfig();

        return {

            url: config.url,

            hasToken: Boolean(config.token),

            configured: Boolean(config.url && config.token)

        };

    });

    ipcMain.on('renderer-price-ready', () => scheduleGooglePricePoll(250));

    ipcMain.handle('get-google-price-status', () => getGooglePriceStatus());

    ipcMain.handle('refresh-google-price-now', async () => pollGooglePrice('manual'));

    ipcMain.handle('sync-prices-to-web', async () => syncPricesToPublicWeb(getPriceState()));

    ipcMain.handle('sync-inventory-to-web', async (_event, payload) => {

        const inventory = payload && Array.isArray(payload.inventory) ? payload.inventory : null;

        if (inventory) {

            return syncPublicWeb('/api/sync/inventory', {

                inventory,

                mode: 'snapshot',

                schemaVersion: 2,

                sentAt: new Date().toISOString()

            });

        }

        return syncInventoryToPublicWeb();

    });

    ipcMain.handle('save-prices-and-sync', async (_event, payload) => {

        const nextPrices = mergePriceState(payload);

        if (!nextPrices) return { success: false, reason: 'invalid-prices', message: 'Dữ liệu bảng giá không hợp lệ.' };

        try { persistPriceState(nextPrices); } catch (error) {

            return { success: false, reason: 'local-save-error', message: 'Không thể lưu giá trên máy: ' + error.message };

        }

        // TV/LAN nhận ngay sau khi lưu cục bộ; website được đẩy nền có timeout.

        const eventPayload = broadcastPriceState('app');

        // Nhận token vừa nhập trên giao diện ngay trong lần bấm Lưu; không

        // phụ thuộc việc file settings.json đã ghi xong hay chưa.

        const savedSyncConfig = getPublicWebSyncConfig();

        const syncConfig = payload && typeof payload === 'object'

            ? {

                url: payload.web_sync_url || savedSyncConfig.url,

                token: payload.web_sync_token || savedSyncConfig.token

            }

            : savedSyncConfig;

        const result = await syncPublicWeb('/api/sync/prices', { prices: nextPrices }, syncConfig);

        return { ...result, prices: eventPayload.prices };

    });

    ipcMain.on('prices-updated', (_event, payload) => {

        const nextPrices = mergePriceState(payload);

        if (nextPrices) {

            try { persistPriceState(nextPrices); } catch (_) {}

            broadcastPriceState('app');

            syncPricesToPublicWeb(nextPrices);

        }

    });



    ipcMain.on('pawn-contract-saved', (_event, record) => {

        if (record && typeof record === 'object') syncPublicWeb('/api/sync/pawn', { records: [record] });

    });

    ipcMain.handle('sync-pawn-contract', async (_event, record) => {

        if (!record || typeof record !== 'object') return { success: false, message: 'Phiếu cầm không hợp lệ.' };

        return syncPublicWeb('/api/sync/pawn', { records: [record] });

    });

    ipcMain.handle('sync-pawn-snapshot', async (_event, payload) => {

        const records = payload && Array.isArray(payload.records) ? payload.records.filter(Boolean) : [];

        if (!records.length) return { success: false, message: 'Snapshot phiếu cầm đang trống.' };

        if (records.length > 500) return { success: false, message: 'Snapshot vượt quá 500 phiếu.' };

        return syncPublicWeb('/api/sync/pawn', {

            records,

            mode: 'snapshot',

            reason: String(payload && payload.reason || 'pos-full-snapshot').slice(0, 80),

            sentAt: String(payload && payload.sentAt || new Date().toISOString()).slice(0, 50)

        });

    });

    // ----------------------------------------



    ipcMain.on('set-target-com', (_event, portName) => {

        const value = String(portName || '').trim().toUpperCase();

        if (value) targetComPort = value;

    });



    ipcMain.handle('get-printers', async (event) => {

        const ownerWindow = BrowserWindow.fromWebContents(event.sender);

        if (!ownerWindow || ownerWindow.isDestroyed()) return [];

        return ownerWindow.webContents.getPrintersAsync();

    });



    ipcMain.handle('gold:print-label', async (_event, payload) => {

        if (!payload || typeof payload.html !== 'string') {

            return { success: false, failureReason: 'Thiếu nội dung tem cần in.' };

        }



        const width = Math.max(20, Math.min(120, Number(payload.widthMm) || 60));

        const height = Math.max(10, Math.min(60, Number(payload.heightMm) || 20));

        return printGoldLabelHtml(payload.html, payload.deviceName || '', {

            width: Math.round(width * 1000),

            height: Math.round(height * 1000)

        }, Math.max(1, Math.min(99, Math.floor(Number(payload.copies) || 1))));

    });



    ipcMain.handle('gold:print-document', async (_event, payload) => {

        if (!payload || typeof payload.html !== 'string') {

            return { success: false, failureReason: 'Thiếu nội dung hóa đơn.' };

        }



        // HOTFIX 30/08/2026 — chỉ phần IN HÓA ĐƠN:

        // truyền kích thước A5 thật bằng micron để driver Canon/Windows nhận 148 x 210 mm ổn định hơn.

        // Vẫn mở hộp thoại hệ thống mỗi lần; người dùng có thể đổi máy/khổ nếu cần.

        return printHtml(payload.html, '', { width: 148000, height: 210000 }, false);

    });



    // KBL 11/09/2026 — chỉ bổ sung kênh in chứng từ A4 cho hồ sơ

    // Đối Chiếu & Bù Trừ và Chuộc Mất Giấy. Không thay đổi luồng in cũ.

    ipcMain.handle('gold:print-a4-document', async (_event, payload) => {

        if (!payload || typeof payload.html !== 'string') {

            return { success: false, failureReason: 'Thiếu nội dung chứng từ A4.' };

        }

        return printHtml(payload.html, '', { width: 210000, height: 297000 }, false);

    });

}



function configureSerialPermission() {

    const serialSession = mainWindow.webContents.session;

    serialSession.on('select-serial-port', (event, portList, _webContents, callback) => {

        event.preventDefault();

        if (!Array.isArray(portList) || portList.length === 0) {

            callback('');

            return;

        }



        const target = targetComPort.toUpperCase();

        const matchedPort = portList.find((port) => {

            const values = [

                port.portName,

                port.displayName,

                port.productName,

                port.manufacturer,

                port.path,

                port.portId

            ];

            return values.some(value => String(value || '').toUpperCase().includes(target));

        });

        callback((matchedPort || portList[0]).portId);

    });



    serialSession.setPermissionCheckHandler(() => true);

    serialSession.setDevicePermissionHandler(() => true);

}



function createWindow() {

    mainWindow = new BrowserWindow({
        icon: path.join(__dirname, 'kbl-pos-logo.ico'), // KBL_UI_ICON

        width: 1700,

        height: 980,

        webPreferences: {

            nodeIntegration: true,

            contextIsolation: false,

            nodeIntegrationInSubFrames: true

        }

    });



    mainWindow.setMenuBarVisibility(false);

    configureSerialPermission();

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    mainWindow.on('closed', () => { mainWindow = null; });

}



app.whenReady().then(() => {

    // --- KHỞI ĐỘNG SERVER KHI APP BẬT ---

    startMobileScannerServer();

    // ------------------------------------



    registerIpcHandlers();

    createWindow();

    /* MANUAL WEB ADMIN ONLY */

    /* AUTO INVENTORY WEB SYNC DISABLED MANUAL */

    // Tự động đọc BK/ASK. Vòng lặp dùng setTimeout tuần tự nên không chồng request.

    // Fallback 10 giây; renderer sẽ báo ready và kéo lần đầu sớm hơn.

    scheduleGooglePricePoll(10000);

    app.on('activate', () => {

        if (BrowserWindow.getAllWindows().length === 0) createWindow();

    });

});



app.on('window-all-closed', () => {

    if (process.platform !== 'darwin') app.quit();

});



app.on('before-quit', () => {

    googlePricePollStopped = true;

    clearTimeout(googlePricePollTimer);

    for (const client of Array.from(priceStreamClients)) {

        try { client.end(); } catch (_) {}

    }

    priceStreamClients.clear();

    if (mobileServer) {

        try { mobileServer.close(); } catch (_) {}

        mobileServer = null;

    }

});
