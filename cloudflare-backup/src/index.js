var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var VERSION = "1.0.3-house2-ai-origin-safe-final";
var PUBLIC_SITE_ORIGIN = "https://tiemvangkimbaolam.id.vn";
var PRIMARY_PROXY_TIMEOUT_MS = 5e3;
var PRIMARY_AI_PROXY_TIMEOUT_MS = 180e3;
function primaryProxyTimeoutFor(pathname) {
  const path = String(pathname || "");
  if (path.startsWith("/api/prompt-ai/") || path === "/api/admin/content/name-suggestions" || path.startsWith("/api/adviser/") || path.startsWith("/api/tryon/ai") || path.startsWith("/api/admin/content/studio-run") || path.startsWith("/api/admin/content/generate") || path.startsWith("/api/admin/content/video-caption")) return PRIMARY_AI_PROXY_TIMEOUT_MS;
  return PRIMARY_PROXY_TIMEOUT_MS;
}
__name(primaryProxyTimeoutFor, "primaryProxyTimeoutFor");
var MEDIA_STATE_KEY = "state/catalog-media-state.json";
var MEDIA_BATCH_SIZE = 30;
var MEDIA_MAX_BYTES = 8 * 1024 * 1024;
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}
__name(json, "json");
function safeText(value, max = 100) {
  return String(value ?? "").trim().slice(0, max);
}
__name(safeText, "safeText");
function validIso(value) {
  const text = safeText(value, 80);
  const time = Date.parse(text);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
}
__name(validIso, "validIso");
function primaryOriginFor(env) {
  const configured = safeText(env?.KBL_PRIMARY_ORIGIN_URL || "", 300);
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        return parsed.origin;
      }
    } catch (_) {
    }
  }
  return PUBLIC_SITE_ORIGIN;
}
__name(primaryOriginFor, "primaryOriginFor");
function primaryOriginIsDistinct(env) {
  try {
    return new URL(primaryOriginFor(env)).hostname !== new URL(PUBLIC_SITE_ORIGIN).hostname;
  } catch (_) {
    return false;
  }
}
__name(primaryOriginIsDistinct, "primaryOriginIsDistinct");
function isDirectBackupHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host.endsWith(".workers.dev") || host === "kbl-backup.tiemvangkimbaolam.workers.dev";
}
__name(isDirectBackupHost, "isDirectBackupHost");
async function safeEqual(a, b) {
  const encoder = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(String(a || ""))),
    crypto.subtle.digest("SHA-256", encoder.encode(String(b || "")))
  ]);
  const left = new Uint8Array(hashA);
  const right = new Uint8Array(hashB);
  let diff = 0;
  for (let i = 0; i < left.length; i++) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}
__name(safeEqual, "safeEqual");
async function checkD1(env) {
  if (!env.DB) {
    return {
      connected: false,
      status: "binding-missing",
      record: null,
      error: "DB binding is not available."
    };
  }
  try {
    const row = await env.DB.prepare(`
        SELECT id, service, status, updated_at
        FROM kbl_backup_status
        WHERE id = 1
        LIMIT 1
      `).first();
    return {
      connected: true,
      status: row?.status || "connected",
      record: row || null,
      error: ""
    };
  } catch (error) {
    return {
      connected: false,
      status: "query-error",
      record: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
__name(checkD1, "checkD1");
async function getGoldPrice(env) {
  if (!env.DB) return null;
  return env.DB.prepare(`
      SELECT
        symbol,
        bid_raw,
        ask_raw,
        source_base_vnd,
        markup_vnd,
        final_sell_9999,
        source_checked_at,
        source_success_at,
        synced_at
      FROM kbl_gold_price
      WHERE symbol = 'BK'
      LIMIT 1
    `).first();
}
__name(getGoldPrice, "getGoldPrice");
function publicGoldPrice(row) {
  if (!row) return null;
  const syncedTime = Date.parse(row.synced_at || "");
  const ageSeconds = Number.isFinite(syncedTime) ? Math.max(0, Math.round((Date.now() - syncedTime) / 1e3)) : null;
  return {
    symbol: row.symbol,
    bidRaw: row.bid_raw,
    askRaw: row.ask_raw,
    sourceBaseVnd: row.source_base_vnd,
    markupVnd: row.markup_vnd,
    finalSell9999: row.final_sell_9999,
    sourceCheckedAt: row.source_checked_at,
    sourceSuccessAt: row.source_success_at,
    syncedAt: row.synced_at,
    ageSeconds,
    fresh: ageSeconds !== null && ageSeconds <= 180
  };
}
__name(publicGoldPrice, "publicGoldPrice");
function safeCatalogMedia(value) {
  const text = String(value ?? "").trim();
  if (!text || text.length > 2048) return "";
  if (/^https:\/\//i.test(text) || /^\//.test(text)) return text;
  return "";
}
__name(safeCatalogMedia, "safeCatalogMedia");
function safeCatalogNumber(value, min = 0, max = 1e12) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(max, Math.max(min, number));
}
__name(safeCatalogNumber, "safeCatalogNumber");
function sanitizeCatalogAvailability(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    status: safeText(raw.status || "available", 40) || "available",
    reserved: Boolean(raw.reserved),
    label: safeText(raw.label || "C\xF2n h\xE0ng t\u1EA1i ti\u1EC7m", 120) || "C\xF2n h\xE0ng t\u1EA1i ti\u1EC7m"
  };
}
__name(sanitizeCatalogAvailability, "sanitizeCatalogAvailability");
function sanitizeCatalogProduct(product) {
  if (!product || typeof product !== "object" || Array.isArray(product)) {
    return null;
  }
  const sku = safeText(product.sku, 80);
  const id = safeText(product.id || sku, 120);
  if (!sku || !id) return null;
  return {
    id,
    sku,
    name: safeText(product.name, 160),
    posName: safeText(product.posName, 160),
    displayName: safeText(product.displayName, 160),
    category: safeText(product.category, 100),
    displayShelf: safeText(product.displayShelf, 100),
    displayGoldShelf: safeText(product.displayGoldShelf, 100),
    goldCode: safeText(product.goldCode, 20),
    weightChi: safeCatalogNumber(product.weightChi, 0, 1e4),
    workmanship: Math.round(safeCatalogNumber(product.workmanship, 0, 1e10)),
    sizeLabel: safeText(product.sizeLabel, 80),
    featured: Boolean(product.featured),
    featuredOrder: Math.round(safeCatalogNumber(product.featuredOrder, 0, 1e6)),
    kind: safeText(product.kind, 40),
    status: "available",
    image: safeCatalogMedia(product.image),
    tryOnImage: safeCatalogMedia(product.tryOnImage),
    geminiTryOnImage: safeCatalogMedia(product.geminiTryOnImage),
    description: safeText(product.description, 1200),
    detail: safeText(product.detail, 1200),
    productSymbol: safeText(product.productSymbol, 120),
    goldContentLabel: safeText(product.goldContentLabel, 120),
    attachedWeightChi: safeCatalogNumber(product.attachedWeightChi, 0, 1e4),
    totalWeightChi: safeCatalogNumber(product.totalWeightChi, 0, 1e4),
    producerName: safeText(product.producerName, 200),
    producerCode: safeText(product.producerCode, 100),
    producerAddress: safeText(product.producerAddress, 400),
    supplierName: safeText(product.supplierName, 200),
    supplierAddress: safeText(product.supplierAddress, 400),
    origin: safeText(product.origin || "Vi\u1EC7t Nam", 160),
    applicableStandard: safeText(product.applicableStandard, 240),
    specialMark: safeText(product.specialMark, 160),
    warnings: safeText(product.warnings, 600),
    referencePrice: Math.round(safeCatalogNumber(product.referencePrice, 0, 1e12)),
    availability: sanitizeCatalogAvailability(product.availability)
  };
}
__name(sanitizeCatalogProduct, "sanitizeCatalogProduct");
async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value ?? ""));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
async function getCatalogSnapshot(env) {
  if (!env.DB) return null;
  return env.DB.prepare(`
      SELECT
        id,
        product_count,
        checksum,
        source_updated_at,
        synced_at,
        payload_json
      FROM kbl_public_catalog_snapshot
      WHERE id = 1
      LIMIT 1
    `).first();
}
__name(getCatalogSnapshot, "getCatalogSnapshot");
function publicCatalogSnapshot(row) {
  if (!row) return null;
  let products = [];
  try {
    const parsed = JSON.parse(String(row.payload_json || "[]"));
    if (Array.isArray(parsed)) products = parsed;
  } catch (_) {
  }
  const syncedTime = Date.parse(row.synced_at || "");
  const ageSeconds = Number.isFinite(syncedTime) ? Math.max(0, Math.round((Date.now() - syncedTime) / 1e3)) : null;
  return {
    productCount: Number(row.product_count || products.length || 0),
    checksum: safeText(row.checksum, 128),
    sourceUpdatedAt: row.source_updated_at || "",
    syncedAt: row.synced_at || "",
    ageSeconds,
    fresh: ageSeconds !== null && ageSeconds <= 900,
    products
  };
}
__name(publicCatalogSnapshot, "publicCatalogSnapshot");
async function syncCatalog(request, env) {
  if (!env.DB) {
    return json({
      success: false,
      message: "D1 binding is unavailable."
    }, 503);
  }
  const expectedSecret = String(env.KBL_BACKUP_SYNC_SECRET || "");
  if (!expectedSecret) {
    return json({
      success: false,
      message: "Backup sync secret is not configured."
    }, 503);
  }
  const suppliedSecret = request.headers.get("x-kbl-sync-secret") || "";
  if (!await safeEqual(expectedSecret, suppliedSecret)) {
    return json({
      success: false,
      message: "Unauthorized."
    }, 401);
  }
  const maxPayloadBytes = 2 * 1024 * 1024;
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > maxPayloadBytes) {
    return json({
      success: false,
      message: "Catalog payload too large."
    }, 413);
  }
  let raw = "";
  let body;
  try {
    raw = await request.text();
    if (new TextEncoder().encode(raw).length > maxPayloadBytes) {
      return json({
        success: false,
        message: "Catalog payload too large."
      }, 413);
    }
    body = JSON.parse(raw);
  } catch (_) {
    return json({
      success: false,
      message: "Invalid JSON."
    }, 400);
  }
  const sourceUpdatedAt = validIso(body?.sourceUpdatedAt);
  const incomingProducts = Array.isArray(body?.products) ? body.products : null;
  if (!sourceUpdatedAt) {
    return json({
      success: false,
      message: "sourceUpdatedAt is invalid."
    }, 400);
  }
  if (!incomingProducts) {
    return json({
      success: false,
      message: "Catalog products array is missing."
    }, 400);
  }
  if (incomingProducts.length < 1 || incomingProducts.length > 2e3) {
    return json({
      success: false,
      message: "Catalog product count is outside the safe range."
    }, 400);
  }
  const products = [];
  const seenSku = /* @__PURE__ */ new Set();
  for (const rawProduct of incomingProducts) {
    const product = sanitizeCatalogProduct(rawProduct);
    if (!product) continue;
    const key = product.sku.toUpperCase();
    if (seenSku.has(key)) continue;
    seenSku.add(key);
    products.push(product);
  }
  if (!products.length) {
    return json({
      success: false,
      message: "Catalog contains no valid public products."
    }, 400);
  }
  const existing = await getCatalogSnapshot(env);
  if (existing?.source_updated_at) {
    const oldTime = Date.parse(existing.source_updated_at);
    const incomingTime = Date.parse(sourceUpdatedAt);
    if (Number.isFinite(oldTime) && Number.isFinite(incomingTime) && incomingTime < oldTime) {
      return json({
        success: false,
        message: "Stale catalog payload rejected."
      }, 409);
    }
  }
  const payloadJson = JSON.stringify(products);
  const checksum = await sha256Hex(payloadJson);
  const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO kbl_public_catalog_snapshot (
        id,
        product_count,
        checksum,
        source_updated_at,
        synced_at,
        payload_json
      )
      VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        product_count = excluded.product_count,
        checksum = excluded.checksum,
        source_updated_at = excluded.source_updated_at,
        synced_at = excluded.synced_at,
        payload_json = excluded.payload_json
    `).bind(
      products.length,
      checksum,
      sourceUpdatedAt,
      syncedAt,
      payloadJson
    ),
    env.DB.prepare(`
      INSERT INTO kbl_sync_state (
        sync_key,
        source,
        status,
        last_attempt_at,
        last_success_at,
        last_error,
        updated_at
      )
      VALUES (
        'catalog',
        'TENTEN',
        'online',
        ?,
        ?,
        '',
        ?
      )
      ON CONFLICT(sync_key) DO UPDATE SET
        source = excluded.source,
        status = excluded.status,
        last_attempt_at = excluded.last_attempt_at,
        last_success_at = excluded.last_success_at,
        last_error = '',
        updated_at = excluded.updated_at
    `).bind(
      syncedAt,
      syncedAt,
      syncedAt
    )
  ]);
  return json({
    success: true,
    message: "Public catalog synchronized to Cloudflare D1.",
    catalog: {
      productCount: products.length,
      checksum,
      sourceUpdatedAt,
      syncedAt
    }
  });
}
__name(syncCatalog, "syncCatalog");
async function pullCatalogFromPrimary(env) {
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2e4);
  try {
    const primary = new URL(primaryOriginFor(env));
    const publicOrigin = new URL(PUBLIC_SITE_ORIGIN);
    if (primary.hostname === publicOrigin.hostname) {
      throw new Error("Primary origin is not separated from the public hostname.");
    }
    const response = await fetch(`${PUBLIC_SITE_ORIGIN}/api/products`, {
      method: "GET",
      headers: { "accept": "application/json", "x-kbl-origin-pull": "1" },
      cache: "no-store",
      signal: controller.signal,
      cf: {
        resolveOverride: primary.hostname
      }
    });
    if (!response.ok) {
      throw new Error(`Primary catalog HTTP ${response.status}`);
    }
    const body = await response.json();
    const products = Array.isArray(body?.products) ? body.products : null;
    if (!products || products.length < 1) {
      throw new Error("Primary catalog returned no products.");
    }
    const secret = String(env.KBL_BACKUP_SYNC_SECRET || "");
    if (!secret) {
      throw new Error("Backup sync secret is not configured.");
    }
    const internalRequest = new Request("https://kbl-internal/sync/catalog", {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-kbl-sync-secret": secret
      },
      body: JSON.stringify({
        sourceUpdatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        products
      })
    });
    const saved = await syncCatalog(internalRequest, env);
    if (!saved.ok) {
      const errorBody = await saved.text().catch(() => "");
      throw new Error(`Catalog save failed HTTP ${saved.status}${errorBody ? `: ${errorBody.slice(0, 220)}` : ""}`);
    }
    return {
      success: true,
      productCount: products.length,
      startedAt,
      finishedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch (error) {
    const failedAt = (/* @__PURE__ */ new Date()).toISOString();
    const message = error?.name === "AbortError" ? "Primary catalog pull timed out." : safeText(error?.message || String(error), 300);
    if (env.DB) {
      try {
        await env.DB.prepare(`
          INSERT INTO kbl_sync_state (
            sync_key,
            source,
            status,
            last_attempt_at,
            last_success_at,
            last_error,
            updated_at
          )
          VALUES ('catalog', 'TENTEN', 'error', ?, NULL, ?, ?)
          ON CONFLICT(sync_key) DO UPDATE SET
            source = excluded.source,
            status = excluded.status,
            last_attempt_at = excluded.last_attempt_at,
            last_error = excluded.last_error,
            updated_at = excluded.updated_at
        `).bind(failedAt, message, failedAt).run();
      } catch (_) {
      }
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
__name(pullCatalogFromPrimary, "pullCatalogFromPrimary");
function canonicalPrimaryMediaPath(value) {
  const raw = safeCatalogMedia(value);
  if (!raw) return "";
  try {
    let path = "";
    if (raw.startsWith("/")) {
      const parsed = new URL(raw, PUBLIC_SITE_ORIGIN);
      path = `${parsed.pathname}${parsed.search}`;
    } else {
      const parsed = new URL(raw);
      if (parsed.origin !== PUBLIC_SITE_ORIGIN) return "";
      path = `${parsed.pathname}${parsed.search}`;
    }
    if (!path.startsWith("/api/catalog-media/") && !path.startsWith("/uploads/studio/")) {
      return "";
    }
    return path.slice(0, 2048);
  } catch (_) {
    return "";
  }
}
__name(canonicalPrimaryMediaPath, "canonicalPrimaryMediaPath");
function base64UrlEncodeUtf8(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
__name(base64UrlEncodeUtf8, "base64UrlEncodeUtf8");
function base64UrlDecodeUtf8(value) {
  const text = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = text + "=".repeat((4 - (text.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
__name(base64UrlDecodeUtf8, "base64UrlDecodeUtf8");
function backupMediaPath(value) {
  const primaryPath = canonicalPrimaryMediaPath(value);
  if (!primaryPath) return safeCatalogMedia(value);
  return `/api/backup-media/${base64UrlEncodeUtf8(primaryPath)}`;
}
__name(backupMediaPath, "backupMediaPath");
function rewriteCatalogMedia(products) {
  return (Array.isArray(products) ? products : []).map((product) => ({
    ...product,
    image: backupMediaPath(product?.image),
    tryOnImage: backupMediaPath(product?.tryOnImage),
    geminiTryOnImage: backupMediaPath(product?.geminiTryOnImage)
  }));
}
__name(rewriteCatalogMedia, "rewriteCatalogMedia");
function catalogPrimaryMediaSources(products) {
  const seen = /* @__PURE__ */ new Set();
  const rows = [];
  for (const product of Array.isArray(products) ? products : []) {
    for (const field of ["image", "tryOnImage", "geminiTryOnImage"]) {
      const source = canonicalPrimaryMediaPath(product?.[field]);
      if (!source || seen.has(source)) continue;
      seen.add(source);
      rows.push(source);
    }
  }
  return rows;
}
__name(catalogPrimaryMediaSources, "catalogPrimaryMediaSources");
async function mediaKeyForSource(source) {
  return `media/${await sha256Hex(source)}`;
}
__name(mediaKeyForSource, "mediaKeyForSource");
async function readMediaState(env) {
  if (!env.MEDIA) return null;
  try {
    const object = await env.MEDIA.get(MEDIA_STATE_KEY);
    if (!object) return null;
    const parsed = JSON.parse(await object.text());
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}
__name(readMediaState, "readMediaState");
async function writeMediaState(env, state) {
  if (!env.MEDIA) return;
  await env.MEDIA.put(MEDIA_STATE_KEY, JSON.stringify(state), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      cacheControl: "no-store"
    }
  });
}
__name(writeMediaState, "writeMediaState");
async function fetchPrimaryMedia(source, env) {
  const primaryPath = canonicalPrimaryMediaPath(source);
  if (!primaryPath) throw new Error("Unsupported primary media path.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12e3);
  try {
    const primary = new URL(primaryOriginFor(env));
    const publicOrigin = new URL(PUBLIC_SITE_ORIGIN);
    if (primary.hostname === publicOrigin.hostname) {
      throw new Error("Primary origin is not separated from the public hostname.");
    }
    const response = await fetch(`${PUBLIC_SITE_ORIGIN}${primaryPath}`, {
      method: "GET",
      headers: { "accept": "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.5", "x-kbl-origin-pull": "1" },
      cache: "no-store",
      signal: controller.signal,
      cf: {
        resolveOverride: primary.hostname
      }
    });
    if (!response.ok) {
      throw new Error(`Primary media HTTP ${response.status}`);
    }
    const contentType = safeText(response.headers.get("content-type") || "", 120).toLowerCase();
    if (!contentType.startsWith("image/")) {
      throw new Error("Primary media did not return an image.");
    }
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > MEDIA_MAX_BYTES) {
      throw new Error("Primary media is too large.");
    }
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MEDIA_MAX_BYTES) {
      throw new Error("Primary media size is outside the safe range.");
    }
    return {
      bytes,
      contentType,
      etag: safeText(response.headers.get("etag") || "", 160)
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Primary media fetch timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
__name(fetchPrimaryMedia, "fetchPrimaryMedia");
async function ensureMediaStored(env, source) {
  if (!env.MEDIA) throw new Error("R2 MEDIA binding is unavailable.");
  const primaryPath = canonicalPrimaryMediaPath(source);
  if (!primaryPath) return { success: true, skipped: true, source: "" };
  const key = await mediaKeyForSource(primaryPath);
  const existing = await env.MEDIA.head(key);
  if (existing) {
    return { success: true, cached: true, source: primaryPath, key };
  }
  const media = await fetchPrimaryMedia(primaryPath, env);
  await env.MEDIA.put(key, media.bytes, {
    httpMetadata: {
      contentType: media.contentType,
      cacheControl: "public, max-age=31536000, immutable"
    },
    customMetadata: {
      sourcePath: primaryPath,
      sourceEtag: media.etag,
      mirroredAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  });
  return { success: true, cached: false, source: primaryPath, key };
}
__name(ensureMediaStored, "ensureMediaStored");
async function mapWithConcurrency(items, limit, task) {
  const rows = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        rows[index] = await task(items[index], index);
      } catch (error) {
        rows[index] = {
          success: false,
          error: safeText(error?.message || String(error), 240)
        };
      }
    }
  });
  await Promise.all(workers);
  return rows;
}
__name(mapWithConcurrency, "mapWithConcurrency");
async function mirrorMediaBatch(env) {
  if (!env.MEDIA) {
    throw new Error("R2 MEDIA binding is unavailable.");
  }
  const catalog = publicCatalogSnapshot(await getCatalogSnapshot(env));
  if (!catalog || !catalog.productCount) {
    throw new Error("Catalog backup is unavailable.");
  }
  const sources = catalogPrimaryMediaSources(catalog.products);
  const mediaSourcesChecksum = await sha256Hex(JSON.stringify([...sources].sort()));
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const current = await readMediaState(env);
  const canReuseCurrent = Boolean(
    current && (
      current.mediaSourcesChecksum === mediaSourcesChecksum ||
      (!current.mediaSourcesChecksum && Number(current.totalSources || 0) === sources.length)
    )
  );
  let state = canReuseCurrent ? {
    ...current,
    catalogChecksum: catalog.checksum,
    mediaSourcesChecksum
  } : {
    catalogChecksum: catalog.checksum,
    mediaSourcesChecksum,
    cursor: 0,
    totalSources: sources.length,
    ready: sources.length === 0,
    cycleFailures: 0,
    cycleStartedAt: now,
    cycleCompletedAt: "",
    lastRunAt: "",
    lastSuccessAt: "",
    lastError: ""
  };
  if (!sources.length) {
    state.ready = true;
    state.cursor = 0;
    state.totalSources = 0;
    state.lastRunAt = now;
    state.lastSuccessAt = now;
    state.lastError = "";
    await writeMediaState(env, state);
    return state;
  }
  let start = Math.max(0, Math.min(Number(state.cursor || 0), sources.length));
  if (start >= sources.length) start = 0;
  const batch = sources.slice(start, start + MEDIA_BATCH_SIZE);
  const results = await mapWithConcurrency(batch, 4, (source) => ensureMediaStored(env, source));
  const failures = results.filter((row) => !row?.success);
  const completed = start + batch.length >= sources.length;
  state.totalSources = sources.length;
  state.cursor = completed ? 0 : start + batch.length;
  state.lastRunAt = now;
  state.cycleFailures = Math.max(0, Number(state.cycleFailures || 0)) + failures.length;
  state.lastError = failures.length ? safeText(failures[0].error || "Media mirror failed.", 240) : "";
  if (!failures.length) state.lastSuccessAt = now;
  if (completed) {
    state.cycleCompletedAt = now;
    state.ready = state.cycleFailures === 0;
    state.cycleFailures = 0;
    state.cycleStartedAt = now;
  }
  await writeMediaState(env, state);
  return state;
}
__name(mirrorMediaBatch, "mirrorMediaBatch");
function publicMediaState(state) {
  if (!state) {
    return {
      configured: false,
      ready: false,
      totalSources: 0,
      cursor: 0,
      progressPercent: 0,
      lastRunAt: "",
      lastSuccessAt: "",
      lastError: ""
    };
  }
  const total = Math.max(0, Number(state.totalSources || 0));
  const cursor = Math.max(0, Number(state.cursor || 0));
  return {
    configured: true,
    ready: Boolean(state.ready),
    totalSources: total,
    cursor,
    progressPercent: state.ready ? 100 : total > 0 ? Math.min(99, Math.round(cursor / total * 100)) : 0,
    cycleCompletedAt: state.cycleCompletedAt || "",
    lastRunAt: state.lastRunAt || "",
    lastSuccessAt: state.lastSuccessAt || "",
    lastError: state.lastError || ""
  };
}
__name(publicMediaState, "publicMediaState");
async function authorizeMediaSync(request, env) {
  const expectedSecret = String(env.KBL_BACKUP_SYNC_SECRET || "");
  const suppliedSecret = request.headers.get("x-kbl-sync-secret") || "";
  return Boolean(expectedSecret) && await safeEqual(expectedSecret, suppliedSecret);
}
__name(authorizeMediaSync, "authorizeMediaSync");
async function serveBackupMedia(request, env, token) {
  if (!env.MEDIA) {
    return json({ success: false, message: "R2 MEDIA binding is unavailable." }, 503);
  }
  let source = "";
  try {
    source = canonicalPrimaryMediaPath(base64UrlDecodeUtf8(token));
  } catch (_) {
  }
  if (!source) {
    return json({ success: false, message: "Invalid backup media token." }, 400);
  }
  const key = await mediaKeyForSource(source);
  let object = await env.MEDIA.get(key);
  if (!object) {
    try {
      await ensureMediaStored(env, source);
      object = await env.MEDIA.get(key);
    } catch (_) {
    }
  }
  if (!object) {
    try {
      return env.ASSETS.fetch(new Request(new URL("/logo-kim-bao-lam.png", request.url)));
    } catch (_) {
      return new Response(null, { status: 404 });
    }
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("x-kbl-media-source", "cloudflare-r2");
  return new Response(object.body, { status: 200, headers });
}
__name(serveBackupMedia, "serveBackupMedia");
async function syncGoldPrice(request, env) {
  if (!env.DB) {
    return json({
      success: false,
      message: "D1 binding is unavailable."
    }, 503);
  }
  const expectedSecret = String(env.KBL_BACKUP_SYNC_SECRET || "");
  if (!expectedSecret) {
    return json({
      success: false,
      message: "Backup sync secret is not configured."
    }, 503);
  }
  const suppliedSecret = request.headers.get("x-kbl-sync-secret") || "";
  if (!await safeEqual(expectedSecret, suppliedSecret)) {
    return json({
      success: false,
      message: "Unauthorized."
    }, 401);
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 8192) {
    return json({
      success: false,
      message: "Payload too large."
    }, 413);
  }
  let raw = "";
  let body;
  try {
    raw = await request.text();
    if (raw.length > 8192) {
      return json({
        success: false,
        message: "Payload too large."
      }, 413);
    }
    body = JSON.parse(raw);
  } catch (_) {
    return json({
      success: false,
      message: "Invalid JSON."
    }, 400);
  }
  const symbol = safeText(body?.symbol, 10).toUpperCase();
  const bidRaw = safeText(body?.bidRaw, 40);
  const askRaw = safeText(body?.askRaw, 40);
  const sourceBaseVnd = Math.round(Number(body?.sourceBaseVnd));
  const markupVnd = Math.round(Number(body?.markupVnd));
  const finalSell9999 = Math.round(Number(body?.finalSell9999));
  const sourceCheckedAt = validIso(body?.sourceCheckedAt);
  const sourceSuccessAt = validIso(body?.sourceSuccessAt);
  if (symbol !== "BK") {
    return json({
      success: false,
      message: "Unsupported gold symbol."
    }, 400);
  }
  if (!bidRaw || !askRaw) {
    return json({
      success: false,
      message: "BK BID/ASK is missing."
    }, 400);
  }
  if (!Number.isFinite(sourceBaseVnd) || sourceBaseVnd < 1e6 || sourceBaseVnd > 1e8) {
    return json({
      success: false,
      message: "sourceBaseVnd is outside the safe range."
    }, 400);
  }
  if (!Number.isFinite(markupVnd) || markupVnd < 0 || markupVnd > 5e6) {
    return json({
      success: false,
      message: "markupVnd is outside the safe range."
    }, 400);
  }
  if (!Number.isFinite(finalSell9999) || finalSell9999 < 1e6 || finalSell9999 > 1e8) {
    return json({
      success: false,
      message: "finalSell9999 is outside the safe range."
    }, 400);
  }
  const expectedFinal = Math.round((sourceBaseVnd + markupVnd) / 1e3) * 1e3;
  if (Math.abs(finalSell9999 - expectedFinal) > 1e3) {
    return json({
      success: false,
      message: "Gold price arithmetic verification failed."
    }, 400);
  }
  if (!sourceSuccessAt) {
    return json({
      success: false,
      message: "sourceSuccessAt is invalid."
    }, 400);
  }
  const existing = await getGoldPrice(env);
  if (existing) {
    const oldTime = Date.parse(
      existing.source_success_at || existing.synced_at || ""
    );
    const incomingTime = Date.parse(sourceSuccessAt);
    if (Number.isFinite(oldTime) && Number.isFinite(incomingTime) && incomingTime < oldTime) {
      return json({
        success: false,
        message: "Stale gold-price payload rejected."
      }, 409);
    }
  }
  const syncedAt = (/* @__PURE__ */ new Date()).toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO kbl_gold_price (
        symbol,
        bid_raw,
        ask_raw,
        source_base_vnd,
        markup_vnd,
        final_sell_9999,
        source_checked_at,
        source_success_at,
        synced_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)

      ON CONFLICT(symbol) DO UPDATE SET
        bid_raw = excluded.bid_raw,
        ask_raw = excluded.ask_raw,
        source_base_vnd = excluded.source_base_vnd,
        markup_vnd = excluded.markup_vnd,
        final_sell_9999 = excluded.final_sell_9999,
        source_checked_at = excluded.source_checked_at,
        source_success_at = excluded.source_success_at,
        synced_at = excluded.synced_at
    `).bind(
      symbol,
      bidRaw,
      askRaw,
      sourceBaseVnd,
      markupVnd,
      finalSell9999,
      sourceCheckedAt || null,
      sourceSuccessAt,
      syncedAt
    ),
    env.DB.prepare(`
      INSERT INTO kbl_sync_state (
        sync_key,
        source,
        status,
        last_attempt_at,
        last_success_at,
        last_error,
        updated_at
      )
      VALUES (
        'gold-price',
        'TENTEN',
        'online',
        ?,
        ?,
        '',
        ?
      )

      ON CONFLICT(sync_key) DO UPDATE SET
        source = excluded.source,
        status = excluded.status,
        last_attempt_at = excluded.last_attempt_at,
        last_success_at = excluded.last_success_at,
        last_error = '',
        updated_at = excluded.updated_at
    `).bind(
      syncedAt,
      syncedAt,
      syncedAt
    )
  ]);
  const saved = await getGoldPrice(env);
  return json({
    success: true,
    message: "Gold price synchronized to Cloudflare D1.",
    goldPrice: publicGoldPrice(saved)
  });
}
__name(syncGoldPrice, "syncGoldPrice");
function htmlEscape(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
__name(htmlEscape, "htmlEscape");
function vnd(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? `${Math.round(n).toLocaleString("vi-VN")} \u0111` : "\u2014";
}
__name(vnd, "vnd");
async function backupProductsResponse(env) {
  try {
    const catalog = publicCatalogSnapshot(await getCatalogSnapshot(env));
    if (!catalog || !catalog.productCount) {
      return json({ success: false, message: "No backed-up public catalog yet." }, 404);
    }
    return json({
      success: true,
      source: "Cloudflare D1 backup",
      products: rewriteCatalogMedia(catalog.products),
      backup: {
        productCount: catalog.productCount,
        checksum: catalog.checksum,
        sourceUpdatedAt: catalog.sourceUpdatedAt,
        syncedAt: catalog.syncedAt,
        ageSeconds: catalog.ageSeconds,
        fresh: catalog.fresh
      }
    });
  } catch (error) {
    return json({
      success: false,
      message: "Cannot read backup public catalog.",
      error: error instanceof Error ? error.message : String(error)
    }, 500);
  }
}
__name(backupProductsResponse, "backupProductsResponse");
async function backupGoldResponse(env) {
  try {
    const row = await getGoldPrice(env);
    if (!row) return json({ success: false, message: "No backed-up gold price yet." }, 404);
    return json({ success: true, source: "Cloudflare D1 backup", goldPrice: publicGoldPrice(row) });
  } catch (error) {
    return json({
      success: false,
      message: "Cannot read backup gold price.",
      error: error instanceof Error ? error.message : String(error)
    }, 500);
  }
}
__name(backupGoldResponse, "backupGoldResponse");
async function renderBackupHome(env, locale = "vi", reason = "") {
  const en = locale === "en";
  let gold = null;
  let catalog = null;
  let mediaState = null;
  try {
    gold = publicGoldPrice(await getGoldPrice(env));
  } catch (_) {
  }
  try {
    catalog = publicCatalogSnapshot(await getCatalogSnapshot(env));
  } catch (_) {
  }
  try {
    if (env.MEDIA) mediaState = await readMediaState(env);
  } catch (_) {
  }
  const products = rewriteCatalogMedia(catalog?.products || []).slice(0, 24);
  const sell = gold?.finalSell9999 ? vnd(gold.finalSell9999) : "\u2014";
  const updated = gold?.syncedAt || catalog?.syncedAt || "";
  const title = en ? "Kim Bao Lam backup service" : "Kim B\u1EA3o L\xE2m \xB7 H\u1EC7 th\u1ED1ng d\u1EF1 ph\xF2ng";
  const subtitle = en ? "The primary server is temporarily unavailable. This read-only Cloudflare backup keeps current public prices, catalog and product images available." : "M\xE1y ch\u1EE7 ch\xEDnh \u0111ang t\u1EA1m th\u1EDDi kh\xF4ng ph\u1EA3n h\u1ED3i. Nh\xE0 2 Cloudflare \u0111ang gi\u1EEF b\u1EA3n \u0111\u1ECDc c\xF4ng khai g\u1ED3m gi\xE1, danh m\u1EE5c v\xE0 \u1EA3nh s\u1EA3n ph\u1EA9m.";
  const status = mediaState?.ready ? en ? "D1 + R2 backup ready" : "D1 + R2 \u0111\xE3 s\u1EB5n s\xE0ng" : en ? "Backup data available; media is still synchronizing" : "D\u1EEF li\u1EC7u \u0111\xE3 c\xF3; \u1EA3nh \u0111ang ti\u1EBFp t\u1EE5c \u0111\u1ED3ng b\u1ED9";
  const cards = products.map((p) => `
    <article class="card">
      ${p.image ? `<img src="${htmlEscape(p.image)}" alt="${htmlEscape(p.name || p.sku)}" loading="lazy">` : ""}
      <div class="pad">
        <div class="sku">${htmlEscape(p.sku)}</div>
        <h3>${htmlEscape(p.name || p.posName || p.sku)}</h3>
        <div>${htmlEscape(p.goldContentLabel || p.goldCode || "")}</div>
        <div>${htmlEscape(p.sizeLabel ? `Size ${p.sizeLabel}` : "")}</div>
        <strong>${vnd(p.referencePrice)}</strong>
      </div>
    </article>`).join("");
  return new Response(`<!doctype html>
<html lang="${en ? "en" : "vi"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${htmlEscape(title)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#071426;color:#eef4ff;font-family:Arial,sans-serif}.wrap{max-width:1180px;margin:auto;padding:24px}.top{padding:28px;border:1px solid #274262;border-radius:22px;background:#0d2038;margin-bottom:20px}.brand{font-size:28px;font-weight:800}.muted{color:#b7c7db;line-height:1.55}.stats{display:flex;gap:12px;flex-wrap:wrap;margin:18px 0}.pill{background:#132b49;border:1px solid #31557b;border-radius:999px;padding:9px 13px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px}.card{overflow:hidden;border:1px solid #274262;border-radius:16px;background:#0e1f35}.card img{display:block;width:100%;aspect-ratio:1/1;object-fit:cover;background:#fff}.pad{padding:12px}.pad h3{font-size:16px;margin:5px 0 8px}.sku{font-size:12px;color:#9fb3ca}.pad strong{display:block;margin-top:8px;font-size:17px}.warn{color:#ffd98a}.foot{padding:24px 0;color:#8fa6bf;font-size:13px}@media(max-width:600px){.wrap{padding:12px}.top{padding:20px}.brand{font-size:23px}}
</style></head><body><main class="wrap"><section class="top"><div class="brand">${htmlEscape(title)}</div><p class="muted">${htmlEscape(subtitle)}</p><div class="stats"><span class="pill">${en ? "9999 reference" : "9999 tham kh\u1EA3o"}: ${sell}</span><span class="pill">${en ? "Products" : "S\u1EA3n ph\u1EA9m"}: ${Number(catalog?.productCount || 0)}</span><span class="pill">${htmlEscape(status)}</span></div>${reason ? `<div class="warn">${htmlEscape(reason)}</div>` : ""}${updated ? `<p class="muted">${en ? "Last backup update" : "C\u1EADp nh\u1EADt b\u1EA3n d\u1EF1 ph\xF2ng"}: ${htmlEscape(updated)}</p>` : ""}</section><section class="grid">${cards}</section><div class="foot">Cloudflare House 2 \xB7 read-only failover mode</div></main></body></html>`, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-kbl-failover": "cloudflare-house2"
    }
  });
}
__name(renderBackupHome, "renderBackupHome");
async function fetchPrimaryThroughHiddenOrigin(request, env) {
  const incoming = new URL(request.url);
  const primary = new URL(primaryOriginFor(env));
  if (primary.hostname === incoming.hostname) {
    throw new Error("Primary origin is not separated from the public hostname. Configure KBL_PRIMARY_ORIGIN_URL before enabling the production Worker route.");
  }
  const target = new URL(incoming.pathname + incoming.search, incoming.origin);
  const headers = new Headers(request.headers);
  headers.set("x-kbl-cloudflare-proxy", "house2");
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", "https");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), primaryProxyTimeoutFor(incoming.pathname));
  try {
    const init = {
      method: request.method,
      headers,
      redirect: "manual",
      signal: controller.signal,
      cf: {
        resolveOverride: primary.hostname
      }
    };
    if (!["GET", "HEAD"].includes(request.method)) init.body = request.body;
    const response = await fetch(target.toString(), init);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}
__name(fetchPrimaryThroughHiddenOrigin, "fetchPrimaryThroughHiddenOrigin");
async function proxyPrimaryOrFallback(request, env) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  try {
    const response = await fetchPrimaryThroughHiddenOrigin(request, env);
    const answeredByKblNode = String(response.headers.get("x-kbl-origin-app") || "").toLowerCase() === "kbl-node";
    const aiEndpoint = primaryProxyTimeoutFor(url.pathname) === PRIMARY_AI_PROXY_TIMEOUT_MS;
    // On known AI endpoints, an application-level 5xx (Gemini/DeepSeek/etc.) is not an origin outage.
    // For normal pages/APIs, a 5xx still activates House 2 exactly as before.
    const passThroughAppError = answeredByKblNode && aiEndpoint && response.status >= 500;
    if (response.status < 500 || passThroughAppError) {
      const headers = new Headers(response.headers);
      headers.set("x-kbl-served-by", "tenten-via-cloudflare");
      if (passThroughAppError) headers.set("x-kbl-origin-app-error", "pass-through");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    throw new Error(`Primary returned HTTP ${response.status}`);
  } catch (error) {
    const reason = error?.name === "AbortError" ? "Primary request timed out." : safeText(error?.message || String(error), 220);
    if (method === "GET" || method === "HEAD") {
      if (url.pathname === "/api/products") return backupProductsResponse(env);
      if (url.pathname === "/api/gold-price") return backupGoldResponse(env);
      if (url.pathname.startsWith("/api/catalog-media/") || url.pathname.startsWith("/uploads/studio/")) {
        return serveBackupMedia(request, env, base64UrlEncodeUtf8(`${url.pathname}${url.search}`));
      }
      if (!url.pathname.startsWith("/api/")) {
        return renderBackupHome(env, url.pathname.startsWith("/en") ? "en" : "vi", reason);
      }
    }
    return json({
      success: false,
      message: "Primary server is unavailable. House 2 is operating in read-only failover mode.",
      detail: reason
    }, 503);
  }
}
__name(proxyPrimaryOrFallback, "proxyPrimaryOrFallback");
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!isDirectBackupHost(url.hostname) && request.headers.get("x-kbl-origin-pull") === "1" && !primaryOriginIsDistinct(env)) {
      return json({ success: false, message: "KBL_PRIMARY_ORIGIN_URL must point to a hidden origin before the main domain Worker route is enabled." }, 503);
    }
    if (!isDirectBackupHost(url.hostname) && !url.pathname.startsWith("/api/backup-media/")) {
      return proxyPrimaryOrFallback(request, env);
    }
    if (url.pathname === "/api/health") {
      const d1 = await checkD1(env);
      let goldPrice = null;
      let catalog = null;
      let mediaState = null;
      if (d1.connected) {
        try {
          goldPrice = publicGoldPrice(await getGoldPrice(env));
        } catch (_) {
        }
        try {
          catalog = publicCatalogSnapshot(await getCatalogSnapshot(env));
        } catch (_) {
        }
        if (env.MEDIA) {
          try {
            mediaState = await readMediaState(env);
          } catch (_) {
          }
        }
      }
      return json({
        success: true,
        service: "Kim Bao Lam Cloudflare backup runtime",
        version: VERSION,
        runtime: "cloudflare-workers",
        d1Connected: d1.connected,
        d1Status: d1.status,
        d1Record: d1.record,
        d1Error: d1.error,
        syncSecretConfigured: Boolean(String(env.KBL_BACKUP_SYNC_SECRET || "")),
        goldPriceBackupReady: Boolean(goldPrice),
        goldPriceFresh: Boolean(goldPrice?.fresh),
        catalogBackupReady: Boolean(catalog?.productCount),
        catalogFresh: Boolean(catalog?.fresh),
        catalogProductCount: Number(catalog?.productCount || 0),
        catalogAutoPullEnabled: true,
        catalogAutoPullMinutes: 5,
        r2MediaConfigured: Boolean(env.MEDIA),
        mediaBackup: publicMediaState(mediaState),
        mediaBackupReady: Boolean(mediaState?.ready),
        independentBackupData: Boolean(goldPrice && catalog?.productCount && mediaState?.ready),
        failoverProxyCodeReady: true,
        primaryOriginUrl: primaryOriginFor(env),
        primaryOriginSeparated: primaryOriginIsDistinct(env),
        readyForFailover: Boolean(goldPrice && catalog?.productCount && mediaState?.ready && primaryOriginIsDistinct(env)),
        message: d1.connected ? "D1 is connected. Gold-price sync, catalog auto-pull and R2 media backup are active." : "Worker is online, but D1 is not healthy."
      });
    }
    if (url.pathname === "/api/db-status") {
      const d1 = await checkD1(env);
      return json({
        success: d1.connected,
        database: "kbl-backup-db",
        binding: "DB",
        ...d1
      }, d1.connected ? 200 : 503);
    }
    if (url.pathname === "/api/sync/gold-price" && request.method === "POST") {
      return syncGoldPrice(request, env);
    }
    if (url.pathname === "/api/sync/catalog" && request.method === "POST") {
      return syncCatalog(request, env);
    }
    if (url.pathname === "/api/sync/media-batch" && request.method === "POST") {
      if (!await authorizeMediaSync(request, env)) {
        return json({ success: false, message: "Unauthorized." }, 401);
      }
      try {
        const state = await mirrorMediaBatch(env);
        return json({
          success: true,
          message: "One R2 media backup batch completed.",
          mediaBackup: publicMediaState(state)
        });
      } catch (error) {
        return json({
          success: false,
          message: safeText(error?.message || String(error), 300)
        }, 500);
      }
    }
    if (url.pathname.startsWith("/api/backup-media/")) {
      const token = url.pathname.slice("/api/backup-media/".length);
      return serveBackupMedia(request, env, token);
    }
    if (url.pathname === "/api/media-status") {
      const state = env.MEDIA ? await readMediaState(env) : null;
      return json({
        success: true,
        r2MediaConfigured: Boolean(env.MEDIA),
        mediaBackup: publicMediaState(state)
      });
    }
    if (url.pathname === "/api/gold-price") {
      try {
        const row = await getGoldPrice(env);
        if (!row) {
          return json({
            success: false,
            message: "No backed-up gold price yet."
          }, 404);
        }
        return json({
          success: true,
          source: "Cloudflare D1 backup",
          goldPrice: publicGoldPrice(row)
        });
      } catch (error) {
        return json({
          success: false,
          message: "Cannot read backup gold price.",
          error: error instanceof Error ? error.message : String(error)
        }, 500);
      }
    }
    if (url.pathname === "/api/products") {
      try {
        const catalog = publicCatalogSnapshot(await getCatalogSnapshot(env));
        if (!catalog || !catalog.productCount) {
          return json({
            success: false,
            message: "No backed-up public catalog yet."
          }, 404);
        }
        return json({
          success: true,
          source: "Cloudflare D1 backup",
          products: rewriteCatalogMedia(catalog.products),
          backup: {
            productCount: catalog.productCount,
            checksum: catalog.checksum,
            sourceUpdatedAt: catalog.sourceUpdatedAt,
            syncedAt: catalog.syncedAt,
            ageSeconds: catalog.ageSeconds,
            fresh: catalog.fresh
          }
        });
      } catch (error) {
        return json({
          success: false,
          message: "Cannot read backup public catalog.",
          error: error instanceof Error ? error.message : String(error)
        }, 500);
      }
    }
    if (url.pathname === "/api/failover-status") {
      const d1 = await checkD1(env);
      let goldPrice = null;
      let catalog = null;
      let mediaState = null;
      if (d1.connected) {
        try {
          goldPrice = publicGoldPrice(await getGoldPrice(env));
        } catch (_) {
        }
        try {
          catalog = publicCatalogSnapshot(await getCatalogSnapshot(env));
        } catch (_) {
        }
        if (env.MEDIA) {
          try {
            mediaState = await readMediaState(env);
          } catch (_) {
          }
        }
      }
      return json({
        success: true,
        primaryOrigin: "TENTEN",
        backupOrigin: "Cloudflare Workers",
        workerOnline: true,
        dataLayer: d1.connected ? "d1-connected" : "not-connected",
        goldPriceBackupReady: Boolean(goldPrice),
        goldPriceFresh: Boolean(goldPrice?.fresh),
        catalogBackupReady: Boolean(catalog?.productCount),
        catalogFresh: Boolean(catalog?.fresh),
        catalogProductCount: Number(catalog?.productCount || 0),
        mediaLayer: mediaState?.ready ? "r2-ready" : env.MEDIA ? "r2-syncing" : "not-connected",
        mediaBackupReady: Boolean(mediaState?.ready),
        mediaBackup: publicMediaState(mediaState),
        productionDataSynced: Boolean(goldPrice && catalog?.productCount && mediaState?.ready),
        automaticFailover: primaryOriginIsDistinct(env),
        failoverProxyCodeReady: true,
        primaryOriginUrl: primaryOriginFor(env),
        primaryOriginSeparated: primaryOriginIsDistinct(env),
        readyForProductionTraffic: Boolean(goldPrice && catalog?.productCount && mediaState?.ready && primaryOriginIsDistinct(env))
      });
    }
    if (url.pathname.startsWith("/api/")) {
      return json({
        success: false,
        message: "Backup API route not implemented yet."
      }, 404);
    }
    return renderBackupHome(env, url.pathname.startsWith("/en") ? "en" : "vi");
  },
  async scheduled(event, env, ctx) {
    if (event.cron === "*/5 * * * *") {
      ctx.waitUntil(
        pullCatalogFromPrimary(env).catch((error) => {
          console.warn("KBL BACKUP CATALOG AUTO-PULL:", error?.message || String(error));
        })
      );
    }
    if (event.cron === "* * * * *") {
      ctx.waitUntil(
        mirrorMediaBatch(env).catch((error) => {
          console.warn("KBL BACKUP R2 MEDIA:", error?.message || String(error));
        })
      );
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
