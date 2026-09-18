import { Container, getContainer } from "@cloudflare/containers";
var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var VERSION = "1.2.1-house2-full-node-twin-safe";
var PUBLIC_SITE_ORIGIN = "https://tiemvangkimbaolam.id.vn";
var PRIMARY_PROXY_TIMEOUT_MS = 5e3;
var PRIMARY_PAGE_PROXY_TIMEOUT_MS = 15e3;
var PRIMARY_AI_PROXY_TIMEOUT_MS = 240e3;
function primaryProxyTimeoutFor(pathname) {
  const path = String(pathname || "");
  if (path.startsWith("/api/prompt-ai/") || path === "/api/admin/content/name-suggestions" || path.startsWith("/api/adviser/") || path.startsWith("/api/tryon/ai") || path.startsWith("/api/admin/content/studio-run") || path.startsWith("/api/admin/content/generate") || path.startsWith("/api/admin/content/video-caption")) return PRIMARY_AI_PROXY_TIMEOUT_MS;
  return PRIMARY_PROXY_TIMEOUT_MS;
}
__name(primaryProxyTimeoutFor, "primaryProxyTimeoutFor");
function primaryProxyTimeoutForRequest(request) {
  const url = new URL(request.url);
  const pathnameTimeout = primaryProxyTimeoutFor(url.pathname);
  if (pathnameTimeout === PRIMARY_AI_PROXY_TIMEOUT_MS) return pathnameTimeout;
  const method = String(request.method || "GET").toUpperCase();
  const accept = String(request.headers.get("accept") || "").toLowerCase();
  const fetchMode = String(request.headers.get("sec-fetch-mode") || "").toLowerCase();
  const isPublicNavigation = (method === "GET" || method === "HEAD") && !url.pathname.startsWith("/api/") && (fetchMode === "navigate" || accept.includes("text/html"));
  return isPublicNavigation ? PRIMARY_PAGE_PROXY_TIMEOUT_MS : PRIMARY_PROXY_TIMEOUT_MS;
}
__name(primaryProxyTimeoutForRequest, "primaryProxyTimeoutForRequest");
var MEDIA_STATE_KEY = "state/catalog-media-state.json";
var MEDIA_BATCH_SIZE = 30;
var MEDIA_MAX_BYTES = 8 * 1024 * 1024;
var FULL_RUNTIME_SYNC_STATE_KEY = "full-runtime/sync-state.json";
var FULL_RUNTIME_SOURCE_MANIFEST_KEY = "full-runtime/source-manifest.json";
var FULL_RUNTIME_FAILOVER_LATCH_KEY = "full-runtime/failover-latch.json";
var FULL_RUNTIME_SYNC_BACK_STATE_KEY = "full-runtime/sync-back-state.json";
var FULL_RUNTIME_SYNC_BACK_DELETIONS_KEY = "full-runtime/sync-back-deletions.json";
var FULL_RUNTIME_MAX_FILES_PER_RUN = 64;
var FULL_RUNTIME_REQUESTED_MAX_FILES = 64;
var FULL_RUNTIME_PRIMARY_TIMEOUT_MS = 3e4;
var HOUSE2_CONTAINER_ID = "kbl-production-twin";
var HOUSE2_CONTAINER_TIMEOUT_MS = 250e3;
var HOUSE2_CONTAINER_PORT_READY_MS = 120e3;
var SITE_MIRROR_STATE_KEY = "state/site-mirror-state.json";
var SITE_ASSET_MIRROR_STATE_KEY = "state/site-asset-mirror-state.json";
var SITE_MIRROR_MAX_BYTES = 4 * 1024 * 1024;
var SITE_MIRROR_TIMEOUT_MS = 2e4;
var SITE_MIRROR_ASSET_MAX_BYTES = 64 * 1024 * 1024;
var SITE_MIRROR_ASSET_LIMIT = 180;
var SITE_MIRROR_MINUTE_TARGETS = [
  { id: "home-vi", path: "/vi", key: "site/pages/home-vi.html", kind: "html" },
  { id: "home-en", path: "/en", key: "site/pages/home-en.html", kind: "html" },
  { id: "prices", path: "/api/prices", key: "site/api/prices.json", kind: "json" },
  { id: "prices-history", path: "/api/prices/history", key: "site/api/prices-history.json", kind: "json" },
  { id: "shop", path: "/api/shop", key: "site/api/shop.json", kind: "json" },
  { id: "products-vi", path: "/api/products?locale=vi", key: "site/api/products-vi.json", kind: "json" },
  { id: "products-en", path: "/api/products?locale=en", key: "site/api/products-en.json", kind: "json" },
  { id: "world-gold", path: "/api/market/world-gold", key: "site/api/world-gold.json", kind: "json" }
];
var SITE_MIRROR_FIVE_MINUTE_TARGETS = [
  { id: "prompt-ai", path: "/taoprompt", key: "site/pages/taoprompt.html", kind: "html" },
  { id: "lookup", path: "/tra-cuu", key: "site/pages/lookup.html", kind: "html" },
  { id: "login", path: "/dang-nhap", key: "site/pages/account.html", kind: "html" },
  { id: "customer", path: "/khach-hang", key: "site/pages/customer.html", kind: "html" },
  { id: "admin", path: "/admin", key: "site/pages/admin.html", kind: "html" },
  { id: "remote", path: "/remote", key: "site/pages/remote.html", kind: "html" },
  { id: "tv", path: "/tv", key: "site/pages/tv.html", kind: "html" },
  { id: "buy-guide", path: "/huong-dan-mua-hang", key: "site/pages/huong-dan-mua-hang.html", kind: "html" },
  { id: "payment-policy", path: "/chinh-sach-thanh-toan", key: "site/pages/chinh-sach-thanh-toan.html", kind: "html" },
  { id: "shipping-policy", path: "/chinh-sach-van-chuyen-giao-nhan", key: "site/pages/chinh-sach-van-chuyen-giao-nhan.html", kind: "html" },
  { id: "warranty-policy", path: "/chinh-sach-bao-hanh-doi-tra", key: "site/pages/chinh-sach-bao-hanh-doi-tra.html", kind: "html" },
  { id: "privacy-policy", path: "/chinh-sach-bao-mat", key: "site/pages/chinh-sach-bao-mat.html", kind: "html" },
  { id: "loyalty-policy", path: "/chinh-sach-tri-an-khach-hang-than-thiet", key: "site/pages/chinh-sach-tri-an-khach-hang-than-thiet.html", kind: "html" },
  { id: "policy-bundle", path: "/bo-chinh-sach.html", key: "site/pages/bo-chinh-sach.html", kind: "html" },
  { id: "complaints", path: "/quy-trinh-tiep-nhan-giai-quyet-khieu-nai.html", key: "site/pages/quy-trinh-tiep-nhan-giai-quyet-khieu-nai.html", kind: "html" },
  { id: "price-policy", path: "/chinh-sach-gia.html", key: "site/pages/chinh-sach-gia.html", kind: "html" },
  { id: "commerce-limit", path: "/dieu-kien-han-che-cung-cap-hang-hoa-dich-vu.html", key: "site/pages/dieu-kien-han-che-cung-cap-hang-hoa-dich-vu.html", kind: "html" },
  { id: "refund-policy", path: "/chinh-sach-giao-hang-doi-tra-hoan-tien.html", key: "site/pages/chinh-sach-giao-hang-doi-tra-hoan-tien.html", kind: "html" },
  { id: "support-info", path: "/hinh-thuc-ho-tro-truc-tuyen.html", key: "site/pages/hinh-thuc-ho-tro-truc-tuyen.html", kind: "html" },
  { id: "business-info", path: "/thong-tin-doanh-nghiep.html", key: "site/pages/thong-tin-doanh-nghiep.html", kind: "html" },
  { id: "market-runtime", path: "/kbl-market-world-v1.js", key: "site/runtime/kbl-market-world-v1.js", kind: "javascript" },
  { id: "tryon-status", path: "/api/tryon/premium/status", key: "site/api/tryon-status.json", kind: "json" }
];
export class KblHouse2Container extends Container {
  defaultPort = 3000;
  requiredPorts = [3000];
  sleepAfter = "30m";
  enableInternet = true;
}

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
function siteMirrorAllTargets() {
  return [...SITE_MIRROR_MINUTE_TARGETS, ...SITE_MIRROR_FIVE_MINUTE_TARGETS];
}
__name(siteMirrorAllTargets, "siteMirrorAllTargets");
function siteMirrorTargetById(id) {
  return siteMirrorAllTargets().find((target) => target.id === id) || null;
}
__name(siteMirrorTargetById, "siteMirrorTargetById");
function siteMirrorPageKey(pathname) {
  const path = String(pathname || "/").replace(/\/+$/, "") || "/";
  const aliases = {
    "/": "home-vi", "/vi": "home-vi", "/home": "home-vi", "/index.html": "home-vi",
    "/en": "home-en",
    "/taoprompt": "prompt-ai",
    "/tra-cuu": "lookup", "/lookup": "lookup",
    "/dang-nhap": "login", "/account": "login",
    "/khach-hang": "customer",
    "/admin": "admin",
    "/remote": "remote", "/price": "remote",
    "/tv": "tv",
    "/huong-dan-mua-hang": "buy-guide", "/huong-dan-mua-hang.html": "buy-guide", "/chinh-sach-mua-hang": "buy-guide", "/huong-dan-dat-hang": "buy-guide",
    "/chinh-sach-thanh-toan": "payment-policy", "/chinh-sach-thanh-toan.html": "payment-policy",
    "/chinh-sach-van-chuyen-giao-nhan": "shipping-policy", "/chinh-sach-van-chuyen-giao-nhan.html": "shipping-policy", "/chinh-sach-van-chuyen": "shipping-policy", "/chinh-sach-giao-nhan": "shipping-policy",
    "/chinh-sach-bao-hanh-doi-tra": "warranty-policy", "/chinh-sach-bao-hanh-doi-tra.html": "warranty-policy", "/chinh-sach-bao-hanh": "warranty-policy", "/chinh-sach-doi-tra": "warranty-policy", "/chinh-sach-bao-hanh-va-doi-tra": "warranty-policy",
    "/chinh-sach-bao-mat": "privacy-policy", "/chinh-sach-bao-mat.html": "privacy-policy", "/chinh-sach-bao-mat-thong-tin": "privacy-policy",
    "/chinh-sach-tri-an-khach-hang-than-thiet": "loyalty-policy", "/chinh-sach-tri-an-khach-hang-than-thiet.html": "loyalty-policy",
    "/bo-chinh-sach": "policy-bundle", "/bo-chinh-sach.html": "policy-bundle", "/chinh-sach": "policy-bundle",
    "/quy-trinh-tiep-nhan-giai-quyet-khieu-nai": "complaints", "/quy-trinh-tiep-nhan-giai-quyet-khieu-nai.html": "complaints", "/tiep-nhan-khieu-nai": "complaints", "/tiep-nhan-khieu-nai.html": "complaints", "/khieu-nai": "complaints", "/khieu-nai.html": "complaints",
    "/chinh-sach-gia": "price-policy", "/chinh-sach-gia.html": "price-policy",
    "/dieu-kien-han-che-cung-cap-hang-hoa-dich-vu": "commerce-limit", "/dieu-kien-han-che-cung-cap-hang-hoa-dich-vu.html": "commerce-limit",
    "/chinh-sach-giao-hang-doi-tra-hoan-tien": "refund-policy", "/chinh-sach-giao-hang-doi-tra-hoan-tien.html": "refund-policy",
    "/hinh-thuc-ho-tro-truc-tuyen": "support-info", "/hinh-thuc-ho-tro-truc-tuyen.html": "support-info",
    "/thong-tin-doanh-nghiep": "business-info", "/thong-tin-doanh-nghiep.html": "business-info"
  };
  const id = aliases[path] || "";
  return id ? siteMirrorTargetById(id)?.key || "" : "";
}
__name(siteMirrorPageKey, "siteMirrorPageKey");
function siteMirrorApiKey(url) {
  const path = String(url?.pathname || "");
  if (path === "/api/prices") return "site/api/prices.json";
  if (path === "/api/prices/history") return "site/api/prices-history.json";
  if (path === "/api/shop") return "site/api/shop.json";
  if (path === "/api/market/world-gold") return "site/api/world-gold.json";
  if (path === "/api/tryon/premium/status") return "site/api/tryon-status.json";
  if (path === "/api/products") return String(url.searchParams.get("locale") || "vi").toLowerCase() === "en" ? "site/api/products-en.json" : "site/api/products-vi.json";
  return "";
}
__name(siteMirrorApiKey, "siteMirrorApiKey");
async function readSiteMirrorState(env) {
  if (!env.MEDIA) return null;
  try {
    const object = await env.MEDIA.get(SITE_MIRROR_STATE_KEY);
    if (!object) return null;
    const parsed = JSON.parse(await object.text());
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}
__name(readSiteMirrorState, "readSiteMirrorState");
async function readSiteAssetMirrorState(env) {
  if (!env.MEDIA) return null;
  try {
    const object = await env.MEDIA.get(SITE_ASSET_MIRROR_STATE_KEY);
    if (!object) return null;
    const parsed = JSON.parse(await object.text());
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}
__name(readSiteAssetMirrorState, "readSiteAssetMirrorState");
function publicSiteMirrorState(state, assetMirrorState = null) {
  const targets = state && state.targets && typeof state.targets === "object" ? state.targets : {};
  const required = ["home-vi", "home-en", "prices", "shop", "products-vi", "products-en"];
  return {
    configured: true,
    ready: required.every((id) => Boolean(targets[id]?.lastSuccessAt)),
    lastRunAt: safeText(state?.lastRunAt, 80),
    lastSuccessAt: safeText(state?.lastSuccessAt, 80),
    lastError: safeText(state?.lastError, 300),
    mirroredTargets: Object.values(targets).filter((row) => row?.lastSuccessAt).length,
    targetCount: siteMirrorAllTargets().length,
    homeViReady: Boolean(targets["home-vi"]?.lastSuccessAt),
    homeEnReady: Boolean(targets["home-en"]?.lastSuccessAt),
    pricesReady: Boolean(targets.prices?.lastSuccessAt),
    productsViReady: Boolean(targets["products-vi"]?.lastSuccessAt),
    productsEnReady: Boolean(targets["products-en"]?.lastSuccessAt),
    assetMirrorReady: Boolean(assetMirrorState?.lastSuccessAt),
    assetMirror: assetMirrorState || null
  };
}
__name(publicSiteMirrorState, "publicSiteMirrorState");
async function fetchPrimaryMirrorTarget(env, target) {
  if (!env.MEDIA) throw new Error("R2 MEDIA binding is unavailable.");
  const primary = new URL(primaryOriginFor(env));
  const publicOrigin = new URL(PUBLIC_SITE_ORIGIN);
  if (primary.hostname === publicOrigin.hostname) throw new Error("Primary origin is not separated from the public hostname.");
  const targetUrl = new URL(target.path, PUBLIC_SITE_ORIGIN);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SITE_MIRROR_TIMEOUT_MS);
  try {
    const accept = target.kind === "html" ? "text/html,application/xhtml+xml" : target.kind === "json" ? "application/json" : "application/javascript,text/javascript,*/*";
    const response = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: { accept, "x-kbl-origin-pull": "1" },
      cache: "no-store",
      signal: controller.signal,
      cf: { resolveOverride: primary.hostname }
    });
    if (!response.ok) throw new Error(`Primary mirror ${target.id} HTTP ${response.status}`);
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > SITE_MIRROR_MAX_BYTES) throw new Error(`Primary mirror ${target.id} exceeds size limit.`);
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > SITE_MIRROR_MAX_BYTES) throw new Error(`Primary mirror ${target.id} returned an invalid body size.`);
    const text = new TextDecoder().decode(bytes);
    if (target.kind === "json") {
      try { JSON.parse(text); } catch (_) { throw new Error(`Primary mirror ${target.id} returned invalid JSON.`); }
    } else if (target.kind === "html" && !/<html[\s>]/i.test(text)) {
      throw new Error(`Primary mirror ${target.id} returned invalid HTML.`);
    }
    const syncedAt = new Date().toISOString();
    const contentType = response.headers.get("content-type") || (target.kind === "html" ? "text/html; charset=utf-8" : target.kind === "json" ? "application/json; charset=utf-8" : "application/javascript; charset=utf-8");
    await env.MEDIA.put(target.key, bytes, {
      httpMetadata: { contentType, cacheControl: "no-store" },
      customMetadata: {
        id: target.id,
        sourcePath: target.path,
        syncedAt,
        csp: safeText(response.headers.get("content-security-policy") || "", 1200),
        referrerPolicy: safeText(response.headers.get("referrer-policy") || "", 160),
        permissionsPolicy: safeText(response.headers.get("permissions-policy") || "", 420),
        xFrameOptions: safeText(response.headers.get("x-frame-options") || "", 80),
        xContentTypeOptions: safeText(response.headers.get("x-content-type-options") || "", 80)
      }
    });
    return { id: target.id, ok: true, bytes: bytes.byteLength, syncedAt, error: "" };
  } catch (error) {
    return { id: target.id, ok: false, bytes: 0, syncedAt: "", error: error?.name === "AbortError" ? `Primary mirror ${target.id} timed out.` : safeText(error?.message || String(error), 300) };
  } finally {
    clearTimeout(timeout);
  }
}
__name(fetchPrimaryMirrorTarget, "fetchPrimaryMirrorTarget");
async function syncSiteMirror(env, targets, label = "scheduled") {
  if (!env.MEDIA) throw new Error("R2 MEDIA binding is unavailable.");
  const rows = Array.isArray(targets) ? targets : [];
  const results = new Array(rows.length);
  let cursor = 0;
  async function worker() {
    while (cursor < rows.length) {
      const index = cursor++;
      results[index] = await fetchPrimaryMirrorTarget(env, rows[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, Math.max(1, rows.length)) }, () => worker()));
  const previous = await readSiteMirrorState(env) || { targets: {} };
  const state = { ...previous, targets: { ...(previous.targets || {}) } };
  const runAt = new Date().toISOString();
  let lastError = "";
  let successCount = 0;
  for (const result of results) {
    if (!result) continue;
    const old = state.targets[result.id] || {};
    state.targets[result.id] = result.ok ? { lastSuccessAt: result.syncedAt, bytes: result.bytes, lastError: "" } : { ...old, lastAttemptAt: runAt, lastError: result.error };
    if (result.ok) successCount++; else if (!lastError) lastError = result.error;
  }
  state.lastRunAt = runAt;
  state.lastSuccessAt = successCount ? runAt : safeText(previous.lastSuccessAt, 80);
  state.lastError = lastError;
  state.lastMode = safeText(label, 40);
  await env.MEDIA.put(SITE_MIRROR_STATE_KEY, JSON.stringify(state, null, 2), { httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" } });
  const assetState = await readSiteAssetMirrorState(env);
  return { ...publicSiteMirrorState(state, assetState), successCount, attempted: rows.length };
}
__name(syncSiteMirror, "syncSiteMirror");
async function serveMirroredObject(request, env, key, extraHeaders = {}) {
  if (!env.MEDIA || !key) return null;
  try {
    const object = await env.MEDIA.get(key);
    if (!object) return null;
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    if (object.httpEtag) headers.set("etag", object.httpEtag);
    headers.set("cache-control", "no-store");
    const meta = object.customMetadata || {};
    if (meta.csp) headers.set("content-security-policy", meta.csp);
    if (meta.referrerPolicy) headers.set("referrer-policy", meta.referrerPolicy);
    if (meta.permissionsPolicy) headers.set("permissions-policy", meta.permissionsPolicy);
    if (meta.xFrameOptions) headers.set("x-frame-options", meta.xFrameOptions);
    if (meta.xContentTypeOptions) headers.set("x-content-type-options", meta.xContentTypeOptions);
    headers.set("x-kbl-failover", "cloudflare-house2-full-ui");
    headers.set("x-kbl-house2-source", "primary-mirror");
    for (const [name, value] of Object.entries(extraHeaders || {})) headers.set(name, value);
    const body = String(request.method || "GET").toUpperCase() === "HEAD" ? null : object.body;
    return new Response(body, { status: 200, headers });
  } catch (_) {
    return null;
  }
}
__name(serveMirroredObject, "serveMirroredObject");
async function serveMirroredPage(request, env, pathname) {
  const key = siteMirrorPageKey(pathname);
  if (key) {
    const exact = await serveMirroredObject(request, env, key, { "content-type": "text/html; charset=utf-8" });
    if (exact) return exact;
  }
  const localeKey = String(pathname || "").startsWith("/en") ? "site/pages/home-en.html" : "site/pages/home-vi.html";
  return serveMirroredObject(request, env, localeKey, { "content-type": "text/html; charset=utf-8" });
}
__name(serveMirroredPage, "serveMirroredPage");
function isStaticAssetPath(pathname) {
  return /\.(?:css|js|mjs|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|webmanifest|mp4|webm|mov|mp3|wav|json|xml|txt|pdf)$/i.test(String(pathname || ""));
}
__name(isStaticAssetPath, "isStaticAssetPath");
function normalizeSiteMirrorAssetUrl(value, basePath = "/") {
  const raw = String(value || "").trim().replace(/^['"]|['"]$/g, "");
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:") || raw.startsWith("javascript:") || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("#")) return "";
  try {
    const base = new URL(basePath, PUBLIC_SITE_ORIGIN);
    const parsed = new URL(raw, base);
    if (parsed.origin !== PUBLIC_SITE_ORIGIN) return "";
    if (parsed.pathname.startsWith("/api/catalog-media/") || parsed.pathname.startsWith("/api/backup-media/") || parsed.pathname.startsWith("/uploads/studio/")) return "";
    if (!isStaticAssetPath(parsed.pathname)) return "";
    return `${parsed.pathname}${parsed.search}`.slice(0, 2048);
  } catch (_) {
    return "";
  }
}
__name(normalizeSiteMirrorAssetUrl, "normalizeSiteMirrorAssetUrl");
function discoverSiteMirrorAssets(text, basePath = "/") {
  const source = String(text || "");
  const found = new Set();
  const add = (value) => {
    const normalized = normalizeSiteMirrorAssetUrl(value, basePath);
    if (normalized) found.add(normalized);
  };
  for (const match of source.matchAll(/\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/gi)) add(match[1]);
  for (const match of source.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)) {
    for (const part of String(match[1] || "").split(",")) add(part.trim().split(/\s+/)[0]);
  }
  for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) add(match[1]);
  for (const match of source.matchAll(/["'`](\/[^"'`?#]+\.(?:css|js|mjs|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|webmanifest|mp4|webm|mov|mp3|wav|json|xml|txt|pdf)(?:\?[^"'`]*)?)["'`]/gi)) add(match[1]);
  return [...found];
}
__name(discoverSiteMirrorAssets, "discoverSiteMirrorAssets");
function siteMirrorAssetKey(assetUrl) {
  try {
    const parsed = new URL(assetUrl, PUBLIC_SITE_ORIGIN);
    return `site/assets${parsed.pathname}`;
  } catch (_) {
    return "";
  }
}
__name(siteMirrorAssetKey, "siteMirrorAssetKey");
async function mirrorOneSiteAsset(env, assetUrl) {
  if (!env.MEDIA) return { ok: false, assetUrl, children: [], error: "R2 MEDIA binding is unavailable." };
  const normalized = normalizeSiteMirrorAssetUrl(assetUrl, "/");
  if (!normalized) return { ok: false, assetUrl, children: [], error: "Unsupported static asset URL." };
  const primary = new URL(primaryOriginFor(env));
  const targetUrl = new URL(normalized, PUBLIC_SITE_ORIGIN);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SITE_MIRROR_TIMEOUT_MS);
  try {
    const response = await fetch(targetUrl.toString(), {
      method: "GET",
      headers: { "x-kbl-origin-pull": "1", accept: "*/*" },
      cache: "no-store",
      signal: controller.signal,
      cf: { resolveOverride: primary.hostname }
    });
    if (!response.ok || !response.body) throw new Error(`Static asset HTTP ${response.status}`);
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > SITE_MIRROR_ASSET_MAX_BYTES) throw new Error("Static asset exceeds mirror size limit.");
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const isTextAsset = /(?:text\/|javascript|json|xml|svg)/i.test(contentType) && (!declared || declared <= 2 * 1024 * 1024);
    let children = [];
    let bodyForR2 = response.body;
    if (isTextAsset) {
      const clone = response.clone();
      const text = await clone.text();
      children = discoverSiteMirrorAssets(text, targetUrl.pathname);
    }
    const key = siteMirrorAssetKey(normalized);
    if (!key) throw new Error("Cannot build asset mirror key.");
    await env.MEDIA.put(key, bodyForR2, {
      httpMetadata: { contentType, cacheControl: "public, max-age=3600" },
      customMetadata: { sourcePath: normalized, syncedAt: new Date().toISOString() }
    });
    return { ok: true, assetUrl: normalized, key, children, bytes: declared || 0, error: "" };
  } catch (error) {
    return { ok: false, assetUrl: normalized || assetUrl, children: [], bytes: 0, error: error?.name === "AbortError" ? "Static asset mirror timed out." : safeText(error?.message || String(error), 240) };
  } finally {
    clearTimeout(timeout);
  }
}
__name(mirrorOneSiteAsset, "mirrorOneSiteAsset");
async function syncDiscoveredSiteAssets(env) {
  if (!env.MEDIA) throw new Error("R2 MEDIA binding is unavailable.");
  const queue = [];
  const queued = new Set();
  const enqueue = (assetUrl) => {
    const normalized = normalizeSiteMirrorAssetUrl(assetUrl, "/");
    if (!normalized || queued.has(normalized) || queued.size >= SITE_MIRROR_ASSET_LIMIT) return;
    queued.add(normalized);
    queue.push(normalized);
  };
  for (const target of siteMirrorAllTargets().filter((row) => row.kind === "html")) {
    try {
      const object = await env.MEDIA.get(target.key);
      if (!object) continue;
      const html = await object.text();
      for (const asset of discoverSiteMirrorAssets(html, target.path)) enqueue(asset);
    } catch (_) {
    }
  }
  let cursor = 0;
  let successCount = 0;
  let failCount = 0;
  let lastError = "";
  async function worker() {
    while (cursor < queue.length && cursor < SITE_MIRROR_ASSET_LIMIT) {
      const asset = queue[cursor++];
      const result = await mirrorOneSiteAsset(env, asset);
      if (result.ok) {
        successCount++;
        for (const child of result.children || []) enqueue(child);
      } else {
        failCount++;
        if (!lastError) lastError = result.error;
      }
    }
  }
  await Promise.all(Array.from({ length: 4 }, () => worker()));
  const previous = await readSiteAssetMirrorState(env) || {};
  const state = {
    lastRunAt: new Date().toISOString(),
    lastSuccessAt: successCount ? new Date().toISOString() : safeText(previous.lastSuccessAt, 80),
    discovered: queued.size,
    mirrored: successCount,
    failed: failCount,
    lastError
  };
  await env.MEDIA.put(SITE_ASSET_MIRROR_STATE_KEY, JSON.stringify(state, null, 2), { httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-store" } });
  return state;
}
__name(syncDiscoveredSiteAssets, "syncDiscoveredSiteAssets");
async function serveStaticAssetFallback(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/kbl-market-world-v1.js") {
    const runtime = await serveMirroredObject(request, env, "site/runtime/kbl-market-world-v1.js", { "content-type": "application/javascript; charset=utf-8" });
    if (runtime) return runtime;
  }
  if (isStaticAssetPath(url.pathname)) {
    const mirrored = await serveMirroredObject(request, env, siteMirrorAssetKey(`${url.pathname}${url.search}`));
    if (mirrored) return mirrored;
  }
  if (!env.ASSETS || !isStaticAssetPath(url.pathname)) return null;
  try {
    const response = await env.ASSETS.fetch(request);
    if (!response || response.status === 404) return null;
    const headers = new Headers(response.headers);
    headers.set("x-kbl-failover", "cloudflare-house2-full-ui");
    headers.set("x-kbl-house2-source", "same-git-public-assets");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  } catch (_) {
    return null;
  }
}
__name(serveStaticAssetFallback, "serveStaticAssetFallback");
async function backupPricesStreamResponse(env) {
  if (!env.MEDIA) return null;
  try {
    const object = await env.MEDIA.get("site/api/prices.json");
    if (!object) return null;
    const text = await object.text();
    JSON.parse(text);
    return new Response(`event: prices\ndata: ${text.replace(/\n/g, "")}\n\nretry: 30000\n\n`, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-store",
        "x-kbl-failover": "cloudflare-house2-full-ui"
      }
    });
  } catch (_) {
    return null;
  }
}
__name(backupPricesStreamResponse, "backupPricesStreamResponse");
async function backupApiFromMirror(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/prices/stream") return backupPricesStreamResponse(env);
  const key = siteMirrorApiKey(url);
  if (key) {
    const response = await serveMirroredObject(request, env, key, { "content-type": "application/json; charset=utf-8" });
    if (response) return response;
  }
  if (url.pathname === "/api/products") return backupProductsResponse(env);
  if (url.pathname === "/api/gold-price") return backupGoldResponse(env);
  return null;
}
__name(backupApiFromMirror, "backupApiFromMirror");
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
let fullRuntimeLatchCache = { at: 0, value: null };
function fullRuntimePathSafe(value) {
  const clean = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean || clean.includes("\0") || clean.split("/").some((part) => part === "" || part === "..")) return "";
  if (!clean.startsWith("data/") && !clean.startsWith("uploads/")) return "";
  return clean.slice(0, 1200);
}
__name(fullRuntimePathSafe, "fullRuntimePathSafe");
function fullRuntimeObjectKey(relativePath) {
  const clean = fullRuntimePathSafe(relativePath);
  return clean ? `full-runtime/${clean}` : "";
}
__name(fullRuntimeObjectKey, "fullRuntimeObjectKey");
async function readJsonR2(env, key, fallback = null) {
  if (!env.MEDIA) return fallback;
  try {
    const object = await env.MEDIA.get(key);
    if (!object) return fallback;
    return await object.json();
  } catch (_) { return fallback; }
}
__name(readJsonR2, "readJsonR2");
async function writeJsonR2(env, key, value) {
  if (!env.MEDIA) return false;
  await env.MEDIA.put(key, JSON.stringify(value, null, 2), { httpMetadata: { contentType: "application/json; charset=utf-8" } });
  return true;
}
__name(writeJsonR2, "writeJsonR2");
async function readFailoverLatch(env, force = false) {
  const now = Date.now();
  if (!force && fullRuntimeLatchCache.value && now - fullRuntimeLatchCache.at < 1500) return fullRuntimeLatchCache.value;
  const value = await readJsonR2(env, FULL_RUNTIME_FAILOVER_LATCH_KEY, { active: false, dirty: false });
  fullRuntimeLatchCache = { at: now, value: value && typeof value === "object" ? value : { active: false, dirty: false } };
  return fullRuntimeLatchCache.value;
}
__name(readFailoverLatch, "readFailoverLatch");
async function writeFailoverLatch(env, patch = {}) {
  const previous = await readFailoverLatch(env, true);
  const next = { ...previous, ...patch, updatedAt: new Date().toISOString() };
  await writeJsonR2(env, FULL_RUNTIME_FAILOVER_LATCH_KEY, next);
  fullRuntimeLatchCache = { at: Date.now(), value: next };
  return next;
}
__name(writeFailoverLatch, "writeFailoverLatch");
function house2EnvBundle(env) {
  const chunked = [1,2,3,4,5,6,7,8].map((n) => String(env?.[`KBL_HOUSE2_ENV_BUNDLE_${n}`] || "")).join("");
  return chunked || String(env?.KBL_HOUSE2_ENV_BUNDLE || "") || "{}";
}
__name(house2EnvBundle, "house2EnvBundle");
function house2ContainerConfigured(env) {
  return Boolean(env?.KBL_HOUSE2_APP && env?.KBL_R2_ACCOUNT_ID && env?.KBL_R2_ACCESS_KEY_ID && env?.KBL_R2_SECRET_ACCESS_KEY && env?.KBL_BACKUP_SYNC_SECRET && house2EnvBundle(env) !== "{}");
}
__name(house2ContainerConfigured, "house2ContainerConfigured");
function house2ContainerName(env) {
  const versionId = safeText(env?.CF_VERSION_METADATA?.id || "", 80).replace(/[^a-zA-Z0-9_-]+/g, "-");
  return versionId ? `${HOUSE2_CONTAINER_ID}-${versionId}` : HOUSE2_CONTAINER_ID;
}
__name(house2ContainerName, "house2ContainerName");
async function house2FullNodeReady(env) {
  if (!house2ContainerConfigured(env) || !primaryOriginIsDistinct(env)) return false;
  const state = await readJsonR2(env, FULL_RUNTIME_SYNC_STATE_KEY, null);
  return Boolean(state?.ready);
}
__name(house2FullNodeReady, "house2FullNodeReady");
function house2ContainerRuntimeEnv(env) {
  return {
    NODE_ENV: "production",
    PORT: "3000",
    HOST: "0.0.0.0",
    KBL_HOUSE2_RUNTIME: "1",
    KBL_DATA_DIR: "/mnt/kbl-r2/full-runtime/data",
    KBL_PUBLIC_BASE_URL: PUBLIC_SITE_ORIGIN,
    KBL_PUBLISHER_PUBLIC_BASE_URL: PUBLIC_SITE_ORIGIN,
    KBL_BACKUP_SYNC_SECRET: String(env.KBL_BACKUP_SYNC_SECRET || ""),
    KBL_BACKUP_SYNC_URL: `${env.KBL_BACKUP_PUBLIC_URL || "https://kbl-backup.tiemvangkimbaolam.workers.dev"}/api/sync/gold-price`,
    KBL_HOUSE2_ENV_BUNDLE: house2EnvBundle(env),
    R2_ACCOUNT_ID: String(env.KBL_R2_ACCOUNT_ID || ""),
    R2_BUCKET_NAME: String(env.KBL_R2_BUCKET_NAME || "kbl-backup-media"),
    AWS_ACCESS_KEY_ID: String(env.KBL_R2_ACCESS_KEY_ID || ""),
    AWS_SECRET_ACCESS_KEY: String(env.KBL_R2_SECRET_ACCESS_KEY || "")
  };
}
__name(house2ContainerRuntimeEnv, "house2ContainerRuntimeEnv");
async function fetchHouse2Container(request, env, reason = "") {
  if (!house2ContainerConfigured(env)) throw new Error("House 2 full Node container is not configured.");
  if (!await house2FullNodeReady(env)) throw new Error("House 2 full runtime state is not fully synchronized yet.");
  const container = getContainer(env.KBL_HOUSE2_APP, house2ContainerName(env));
  await container.startAndWaitForPorts({
    ports: [3000],
    startOptions: { envVars: house2ContainerRuntimeEnv(env), enableInternet: true },
    cancellationOptions: { instanceGetTimeoutMS: 20000, portReadyTimeoutMS: HOUSE2_CONTAINER_PORT_READY_MS, waitInterval: 500 }
  });
  const headers = new Headers(request.headers);
  headers.set("x-kbl-house2-runtime", "full-node");
  if (reason) headers.set("x-kbl-failover-reason", safeText(reason, 180));
  const init = { method: request.method, headers, redirect: "manual" };
  if (!["GET", "HEAD"].includes(String(request.method || "GET").toUpperCase())) init.body = request.body;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HOUSE2_CONTAINER_TIMEOUT_MS);
  try {
    init.signal = controller.signal;
    const response = await container.fetch(new Request(request.url, init));
    const out = new Headers(response.headers);
    out.set("x-kbl-served-by", "cloudflare-house2-full-node");
    out.set("x-kbl-failover", "full-node-runtime");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: out });
  } finally { clearTimeout(timeout); }
}
__name(fetchHouse2Container, "fetchHouse2Container");
async function primaryRuntimeFetch(pathname, env, init = {}) {
  const primary = new URL(primaryOriginFor(env));
  const publicOrigin = new URL(PUBLIC_SITE_ORIGIN);
  if (primary.hostname === publicOrigin.hostname) throw new Error("Primary origin is not separated.");
  const target = new URL(pathname, PUBLIC_SITE_ORIGIN);
  const headers = new Headers(init.headers || {});
  headers.set("x-kbl-sync-secret", String(env.KBL_BACKUP_SYNC_SECRET || ""));
  headers.set("x-kbl-origin-pull", "1");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(init.timeoutMs || FULL_RUNTIME_PRIMARY_TIMEOUT_MS));
  try {
    return await fetch(target.toString(), { ...init, headers, signal: controller.signal, cache: "no-store", cf: { resolveOverride: primary.hostname } });
  } finally { clearTimeout(timeout); }
}
__name(primaryRuntimeFetch, "primaryRuntimeFetch");
async function fetchPrimaryRuntimeManifest(env) {
  const response = await primaryRuntimeFetch("/api/house2-sync/manifest", env, { method: "GET" });
  if (!response.ok) throw new Error(`Primary runtime manifest HTTP ${response.status}`);
  const body = await response.json();
  const files = Array.isArray(body?.files) ? body.files.map((row) => ({ path: fullRuntimePathSafe(row?.path), size: Math.max(0, Number(row?.size || 0)), mtimeMs: Math.max(0, Number(row?.mtimeMs || 0)) })).filter((row) => row.path) : [];
  if (!body?.success || !files.length) throw new Error("Primary runtime manifest is empty.");
  return { generatedAt: safeText(body.generatedAt || "", 80), files };
}
__name(fetchPrimaryRuntimeManifest, "fetchPrimaryRuntimeManifest");
async function syncFullRuntimeState(env, requestedPaths = null, reason = "scheduled") {
  if (!env.MEDIA) throw new Error("R2 MEDIA binding is unavailable.");
  const latch = await readFailoverLatch(env);
  if (latch?.active && reason !== "manual-force") return { success: false, skipped: true, reason: "failover-active" };
  const manifest = await fetchPrimaryRuntimeManifest(env);
  const requested = Array.isArray(requestedPaths) && requestedPaths.length ? new Set(requestedPaths.map(fullRuntimePathSafe).filter(Boolean)) : null;
  const manifestMap = new Map(manifest.files.map((row) => [row.path, row]));
  const rows = requested ? Array.from(requested).map((path) => manifestMap.get(path)).filter(Boolean) : manifest.files;
  const limit = requested ? FULL_RUNTIME_REQUESTED_MAX_FILES : FULL_RUNTIME_MAX_FILES_PER_RUN;
  let synced = 0, unchanged = 0, errors = 0, pending = 0;
  const errorRows = [];
  if (requested) {
    for (const path of requested) {
      if (manifestMap.has(path)) continue;
      try { await env.MEDIA.delete(fullRuntimeObjectKey(path)); } catch (_) {}
    }
  }
  for (const row of rows) {
    const key = fullRuntimeObjectKey(row.path);
    if (!key) continue;
    let current = null;
    try { current = await env.MEDIA.head(key); } catch (_) {}
    const metadata = current?.customMetadata || {};
    const same = current && Number(metadata.sourceSize || -1) === row.size && Number(metadata.sourceMtimeMs || -1) === Math.round(row.mtimeMs);
    if (same) { unchanged += 1; continue; }
    if (synced >= limit) { pending += 1; continue; }
    try {
      const source = await primaryRuntimeFetch(`/api/house2-sync/file?path=${encodeURIComponent(row.path)}`, env, { method: "GET", timeoutMs: row.size > 64 * 1024 * 1024 ? 240000 : FULL_RUNTIME_PRIMARY_TIMEOUT_MS });
      if (!source.ok || !source.body) throw new Error(`HTTP ${source.status}`);
      await env.MEDIA.put(key, source.body, {
        httpMetadata: { contentType: source.headers.get("content-type") || "application/octet-stream" },
        customMetadata: { sourceSize: String(row.size), sourceMtimeMs: String(Math.round(row.mtimeMs)), source: "tenten-node" }
      });
      synced += 1;
    } catch (error) {
      errors += 1;
      errorRows.push({ path: row.path, error: safeText(error?.message || String(error), 180) });
    }
  }
  if (!requested) {
    const previous = await readJsonR2(env, FULL_RUNTIME_SOURCE_MANIFEST_KEY, null);
    const nextPaths = new Set(manifest.files.map((row) => row.path));
    const removed = Array.isArray(previous?.files) ? previous.files.map((row) => fullRuntimePathSafe(row?.path)).filter((path) => path && !nextPaths.has(path)) : [];
    for (const path of removed.slice(0, 64)) { try { await env.MEDIA.delete(fullRuntimeObjectKey(path)); } catch (_) {} }
    await writeJsonR2(env, FULL_RUNTIME_SOURCE_MANIFEST_KEY, manifest);
    pending = 0;
    for (const row of manifest.files) {
      try {
        const head = await env.MEDIA.head(fullRuntimeObjectKey(row.path));
        const meta = head?.customMetadata || {};
        if (!head || Number(meta.sourceSize || -1) !== row.size || Number(meta.sourceMtimeMs || -1) !== Math.round(row.mtimeMs)) pending += 1;
      } catch (_) { pending += 1; }
    }
  }
  const previousState = await readJsonR2(env, FULL_RUNTIME_SYNC_STATE_KEY, null);
  const ready = requested ? Boolean(previousState?.ready && errors === 0) : Boolean(errors === 0 && pending === 0 && manifest.files.length > 0);
  const state = {
    version: 2,
    reason,
    sourceFileCount: manifest.files.length,
    checkedFileCount: rows.length,
    synced, unchanged,
    pending: requested ? Number(previousState?.pending || 0) : pending,
    errors,
    lastError: errorRows[0]?.error || "",
    lastErrorRows: errorRows.slice(0, 8),
    lastRunAt: new Date().toISOString(),
    lastSuccessAt: errors === 0 ? new Date().toISOString() : String(previousState?.lastSuccessAt || ""),
    ready
  };
  await writeJsonR2(env, FULL_RUNTIME_SYNC_STATE_KEY, state);
  return { success: errors === 0, ...state };
}
__name(syncFullRuntimeState, "syncFullRuntimeState");
async function markHouse2Write(env, paths = []) {
  const cleanPaths = Array.isArray(paths) ? paths.map(fullRuntimePathSafe).filter(Boolean).slice(0, 64) : [];
  return writeFailoverLatch(env, { active: true, dirty: true, dirtyAt: new Date().toISOString(), lastHouse2WritePaths: cleanPaths });
}
__name(markHouse2Write, "markHouse2Write");
async function authorizeFullRuntimeSync(request, env) {
  const expected = String(env.KBL_BACKUP_SYNC_SECRET || "");
  const supplied = request.headers.get("x-kbl-sync-secret") || "";
  return Boolean(expected) && await safeEqual(expected, supplied);
}
__name(authorizeFullRuntimeSync, "authorizeFullRuntimeSync");
async function parseSmallJson(request, max = 32768) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > max) throw new Error("Payload too large.");
  const raw = await request.text();
  if (raw.length > max) throw new Error("Payload too large.");
  return raw ? JSON.parse(raw) : {};
}
__name(parseSmallJson, "parseSmallJson");
function fullRuntimeSyncBackPublic(state) {
  if (!state || typeof state !== "object") return null;
  return {
    phase: safeText(state.phase || "data", 20), cursor: safeText(state.cursor || "", 500),
    copied: Number(state.copied || 0), deleted: Number(state.deleted || 0), errors: Number(state.errors || 0),
    startedAt: safeText(state.startedAt || "", 80), lastRunAt: safeText(state.lastRunAt || "", 80),
    completedAt: safeText(state.completedAt || "", 80), stable: Boolean(state.stable), lastError: safeText(state.lastError || "", 220)
  };
}
__name(fullRuntimeSyncBackPublic, "fullRuntimeSyncBackPublic");
async function fetchHouse2RuntimeManifest(env) {
  const headers = new Headers({ "x-kbl-sync-secret": String(env.KBL_BACKUP_SYNC_SECRET || "") });
  const request = new Request(`${PUBLIC_SITE_ORIGIN}/api/house2-sync/manifest`, { method:"GET", headers });
  const response = await fetchHouse2Container(request, env, "sync-back-manifest");
  if (!response.ok) throw new Error(`House 2 runtime manifest HTTP ${response.status}`);
  const body = await response.json();
  const files = Array.isArray(body?.files) ? body.files.map((row) => ({ path:fullRuntimePathSafe(row?.path), size:Number(row?.size || 0), mtimeMs:Number(row?.mtimeMs || 0) })).filter((row) => row.path) : [];
  if (!body?.success) throw new Error("House 2 runtime manifest is invalid.");
  return { generatedAt:safeText(body.generatedAt || "",80), files };
}
__name(fetchHouse2RuntimeManifest, "fetchHouse2RuntimeManifest");
async function prepareHouse2SyncBackDeletions(env) {
  const source = await readJsonR2(env, FULL_RUNTIME_SOURCE_MANIFEST_KEY, { files:[] });
  const current = await fetchHouse2RuntimeManifest(env);
  const currentPaths = new Set(current.files.map((row) => row.path));
  const removed = (Array.isArray(source?.files) ? source.files : []).map((row) => fullRuntimePathSafe(row?.path)).filter((path) => path && !currentPaths.has(path));
  const payload = { version:1, generatedAt:new Date().toISOString(), paths:removed };
  await writeJsonR2(env, FULL_RUNTIME_SYNC_BACK_DELETIONS_KEY, payload);
  return payload;
}
__name(prepareHouse2SyncBackDeletions, "prepareHouse2SyncBackDeletions");
async function syncHouse2RuntimeBack(env, maxFiles = 8) {
  if (!env.MEDIA) throw new Error("R2 MEDIA binding is unavailable.");
  const latch = await readFailoverLatch(env, true);
  if (!latch?.active || !latch?.dirty) return { success:false, skipped:true, reason:"failover-not-dirty", latch };
  let state = await readJsonR2(env, FULL_RUNTIME_SYNC_BACK_STATE_KEY, null);
  if (!state || state.completedAt || !["data","uploads","deletes"].includes(state.phase)) {
    state = { version:2, phase:"data", cursor:"", copied:0, deleted:0, errors:0, startedAt:new Date().toISOString(), passDirtyAt:String(latch.dirtyAt || ""), completedAt:"", stable:false, lastError:"" };
    await env.MEDIA.delete(FULL_RUNTIME_SYNC_BACK_DELETIONS_KEY).catch(() => {});
  }
  const prefixes = { data:"full-runtime/data/", uploads:"full-runtime/uploads/" };
  let remaining = Math.min(16, Math.max(1, Number(maxFiles || 8)));
  let copiedThisRun = 0, deletedThisRun = 0;
  while (remaining > 0 && !state.completedAt) {
    if (state.phase === "deletes") {
      const deletionState = await readJsonR2(env, FULL_RUNTIME_SYNC_BACK_DELETIONS_KEY, { paths:[] });
      const paths = Array.isArray(deletionState?.paths) ? deletionState.paths.map(fullRuntimePathSafe).filter(Boolean) : [];
      let index = Math.max(0, Number(state.cursor || 0));
      while (remaining > 0 && index < paths.length) {
        const relative = paths[index++];
        try {
          const response = await primaryRuntimeFetch(`/api/house2-sync/file?path=${encodeURIComponent(relative)}`, env, { method:"DELETE", timeoutMs:60000 });
          if (!response.ok) throw new Error(`Primary delete restore HTTP ${response.status}`);
          state.deleted = Number(state.deleted || 0) + 1;
          deletedThisRun += 1;
        } catch (error) {
          state.errors = Number(state.errors || 0) + 1;
          state.lastError = safeText(error?.message || String(error), 220);
          state.cursor = String(Math.max(0,index-1));
          state.lastRunAt = new Date().toISOString();
          await writeJsonR2(env, FULL_RUNTIME_SYNC_BACK_STATE_KEY, state);
          return { success:false, state:fullRuntimeSyncBackPublic(state) };
        }
        remaining -= 1;
      }
      state.cursor = index < paths.length ? String(index) : "";
      if (index < paths.length) break;
      await env.MEDIA.delete(FULL_RUNTIME_SYNC_BACK_DELETIONS_KEY).catch(() => {});
      const latestLatch = await readFailoverLatch(env, true);
      if (String(latestLatch.dirtyAt || "") !== String(state.passDirtyAt || "")) {
        state.phase = "data";
        state.cursor = "";
        state.passDirtyAt = String(latestLatch.dirtyAt || "");
        state.startedAt = new Date().toISOString();
        continue;
      }
      state.completedAt = new Date().toISOString();
      state.stable = true;
      await writeFailoverLatch(env, { syncBackCompletedAt:state.completedAt, syncBackDirtyAt:String(latestLatch.dirtyAt || "") });
      break;
    }

    const prefix = prefixes[state.phase];
    const listed = await env.MEDIA.list({ prefix, cursor: state.cursor || undefined, limit: Math.min(remaining, 16) });
    for (const object of listed.objects || []) {
      if (remaining <= 0) break;
      const relative = fullRuntimePathSafe(object.key.slice("full-runtime/".length));
      if (!relative) continue;
      try {
        const body = await env.MEDIA.get(object.key);
        if (!body?.body) throw new Error("R2 object body unavailable");
        const headers = new Headers({ "content-type": body.httpMetadata?.contentType || "application/octet-stream" });
        if (Number(object.size || 0) > 0) headers.set("content-length", String(object.size));
        const response = await primaryRuntimeFetch(`/api/house2-sync/file?path=${encodeURIComponent(relative)}`, env, { method:"PUT", body:body.body, headers, timeoutMs:Number(object.size || 0) > 64 * 1024 * 1024 ? 240000 : 60000 });
        if (!response.ok) throw new Error(`Primary restore HTTP ${response.status}`);
        state.copied = Number(state.copied || 0) + 1;
        copiedThisRun += 1;
      } catch (error) {
        state.errors = Number(state.errors || 0) + 1;
        state.lastError = safeText(error?.message || String(error), 220);
        state.lastRunAt = new Date().toISOString();
        await writeJsonR2(env, FULL_RUNTIME_SYNC_BACK_STATE_KEY, state);
        return { success:false, state:fullRuntimeSyncBackPublic(state) };
      }
      remaining -= 1;
    }
    state.cursor = listed.truncated ? String(listed.cursor || "") : "";
    if (listed.truncated) break;
    if (state.phase === "data") { state.phase = "uploads"; state.cursor = ""; continue; }
    await prepareHouse2SyncBackDeletions(env);
    state.phase = "deletes";
    state.cursor = "0";
  }
  state.lastRunAt = new Date().toISOString();
  await writeJsonR2(env, FULL_RUNTIME_SYNC_BACK_STATE_KEY, state);
  return { success:true, copiedThisRun, deletedThisRun, state:fullRuntimeSyncBackPublic(state) };
}
__name(syncHouse2RuntimeBack, "syncHouse2RuntimeBack");

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
  const timeout = setTimeout(() => controller.abort(), primaryProxyTimeoutForRequest(request));
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
  const fallbackRequest = request.clone();
  const latched = await readFailoverLatch(env);
  if (latched?.active) {
    try {
      return await fetchHouse2Container(fallbackRequest, env, latched.reason || "failover-latched");
    } catch (containerError) {
      console.warn("KBL HOUSE2 FULL NODE LATCHED:", containerError?.message || String(containerError));
      if (method === "GET" || method === "HEAD") {
        if (url.pathname.startsWith("/api/")) {
          const mirroredApi = await backupApiFromMirror(request, env);
          if (mirroredApi) return mirroredApi;
        } else {
          const asset = await serveStaticAssetFallback(request, env);
          if (asset) return asset;
          const page = await serveMirroredPage(request, env, url.pathname);
          if (page) return page;
        }
      }
      return json({ success:false, message:"House 2 full Node runtime could not start.", detail:safeText(containerError?.message || String(containerError),220), house2Mode:"emergency-mirror" },503);
    }
  }
  try {
    const response = await fetchPrimaryThroughHiddenOrigin(request, env);
    const answeredByKblNode = String(response.headers.get("x-kbl-origin-app") || "").toLowerCase() === "kbl-node";
    const aiEndpoint = primaryProxyTimeoutFor(url.pathname) === PRIMARY_AI_PROXY_TIMEOUT_MS;
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
    try {
      if (!await house2FullNodeReady(env)) throw new Error("House 2 full Node is not ready; using emergency mirror only.");
      const activatedLatch = await writeFailoverLatch(env, { active:true, dirty:false, activatedAt:new Date().toISOString(), reason, triggerPath:url.pathname, triggerMethod:method });
      // A failed primary write is ambiguous: the origin might have committed it before the timeout.
      // Never replay that same POST/PUT/PATCH/DELETE automatically on House 2 or we could create a duplicate order/payment/admin mutation.
      // Once latched, the client's next write goes only to House 2. Planned maintenance can use /api/failover/activate to avoid this transition entirely.
      if (method !== "GET" && method !== "HEAD") {
        try {
          const probe = new Request(`${PUBLIC_SITE_ORIGIN}/api/health`, { method:"GET", headers:{"x-kbl-house2-transition-probe":"1"} });
          await fetchHouse2Container(probe, env, reason);
        } catch (probeError) {
          const latest = await readFailoverLatch(env, true);
          if (!latest?.dirty) await writeFailoverLatch(env, { active:false, dirty:false, reason:"container-start-failed", clearedAt:new Date().toISOString() });
          throw probeError;
        }
        return new Response(JSON.stringify({ success:false, retryOnHouse2:true, house2Activated:true, message:"House 2 is now active. The interrupted write was not replayed automatically to avoid a duplicate transaction; retry the action once.", latch:activatedLatch }, null, 2), {
          status:503,
          headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","retry-after":"1","x-kbl-failover":"full-node-transition-safe"}
        });
      }
      try {
        return await fetchHouse2Container(fallbackRequest, env, reason);
      } catch (startError) {
        const latest = await readFailoverLatch(env, true);
        if (!latest?.dirty) await writeFailoverLatch(env, { active:false, dirty:false, reason:"container-start-failed", clearedAt:new Date().toISOString() });
        throw startError;
      }
    } catch (containerError) {
      console.warn("KBL HOUSE2 FULL NODE FALLBACK:", containerError?.message || String(containerError));
      if (method === "GET" || method === "HEAD") {
        if (url.pathname.startsWith("/api/catalog-media/") || url.pathname.startsWith("/uploads/")) {
          return serveBackupMedia(request, env, base64UrlEncodeUtf8(`${url.pathname}${url.search}`));
        }
        if (url.pathname.startsWith("/api/")) {
          const mirroredApi = await backupApiFromMirror(request, env);
          if (mirroredApi) return mirroredApi;
        } else {
          const asset = await serveStaticAssetFallback(request, env);
          if (asset) return asset;
          const page = await serveMirroredPage(request, env, url.pathname);
          if (page) return page;
          if (isStaticAssetPath(url.pathname)) return new Response(null, { status: 404, headers: { "x-kbl-failover": "cloudflare-house2-emergency-ui" } });
          return renderBackupHome(env, url.pathname.startsWith("/en") ? "en" : "vi", `${reason} Full Node: ${safeText(containerError?.message || String(containerError),120)}`);
        }
      }
      return json({ success:false, message:"Primary server is unavailable and House 2 full Node could not start.", detail:`${reason} / ${safeText(containerError?.message || String(containerError),180)}`, house2Mode:"emergency-mirror" },503);
    }
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
    if (url.pathname === "/api/sync/full-runtime/paths" && request.method === "POST") {
      if (!await authorizeFullRuntimeSync(request, env)) return json({ success:false, message:"Unauthorized." },401);
      try {
        const body = await parseSmallJson(request);
        const paths = Array.isArray(body?.paths) ? body.paths.slice(0, FULL_RUNTIME_REQUESTED_MAX_FILES) : [];
        const result = await syncFullRuntimeState(env, paths, "primary-dirty-push");
        return json({ success:true, result });
      } catch (error) { return json({ success:false, message:safeText(error?.message || String(error),240) },500); }
    }
    if (url.pathname === "/api/sync/full-runtime/house2-write" && request.method === "POST") {
      if (!await authorizeFullRuntimeSync(request, env)) return json({ success:false, message:"Unauthorized." },401);
      try {
        const body = await parseSmallJson(request);
        const latch = await markHouse2Write(env, body?.paths);
        return json({ success:true, latch });
      } catch (error) { return json({ success:false, message:safeText(error?.message || String(error),240) },500); }
    }
    if (url.pathname === "/api/sync/full-runtime/run" && request.method === "POST") {
      if (!await authorizeFullRuntimeSync(request, env)) return json({ success:false, message:"Unauthorized." },401);
      try { return json({ success:true, result:await syncFullRuntimeState(env, null, "manual-force") }); }
      catch (error) { return json({ success:false, message:safeText(error?.message || String(error),240) },500); }
    }
    if (url.pathname === "/api/failover/activate" && request.method === "POST") {
      if (!await authorizeFullRuntimeSync(request, env)) return json({ success:false, message:"Unauthorized." },401);
      try {
        if (!await house2FullNodeReady(env)) return json({ success:false, message:"House 2 full Node runtime is not ready yet." },409);
        const probe = new Request(`${PUBLIC_SITE_ORIGIN}/api/health`, { method:"GET", headers:{"x-kbl-house2-planned-maintenance":"1"} });
        const response = await fetchHouse2Container(probe, env, "planned-maintenance-prewarm");
        if (!response.ok) return json({ success:false, message:`House 2 prewarm health HTTP ${response.status}.` },409);
        const latch = await writeFailoverLatch(env, { active:true, dirty:false, activatedAt:new Date().toISOString(), reason:"planned-maintenance", triggerPath:"/api/failover/activate", triggerMethod:"POST" });
        return json({ success:true, message:"House 2 full Node is prewarmed and latched. It is now safe to start planned TENTEN maintenance.", latch });
      } catch (error) {
        return json({ success:false, message:safeText(error?.message || String(error),240) },500);
      }
    }
    if (url.pathname === "/api/failover/latch" && request.method === "GET") {
      return json({ success:true, latch:await readFailoverLatch(env,true), fullRuntime:await readJsonR2(env,FULL_RUNTIME_SYNC_STATE_KEY,null), syncBack:fullRuntimeSyncBackPublic(await readJsonR2(env,FULL_RUNTIME_SYNC_BACK_STATE_KEY,null)), containerConfigured:house2ContainerConfigured(env) });
    }
    if (url.pathname === "/api/failover/sync-back" && request.method === "POST") {
      if (!await authorizeFullRuntimeSync(request, env)) return json({ success:false, message:"Unauthorized." },401);
      try {
        const body = await parseSmallJson(request);
        return json(await syncHouse2RuntimeBack(env, Math.min(16, Math.max(1, Number(body?.maxFiles || 8)))));
      } catch (error) { return json({ success:false, message:safeText(error?.message || String(error),240) },500); }
    }
    if (url.pathname === "/api/failover/clear" && request.method === "POST") {
      if (!await authorizeFullRuntimeSync(request, env)) return json({ success:false, message:"Unauthorized." },401);
      const body = await parseSmallJson(request).catch(() => ({}));
      const latch = await readFailoverLatch(env,true);
      if (latch?.dirty) {
        const stable = latch.syncBackCompletedAt && String(latch.syncBackDirtyAt || "") === String(latch.dirtyAt || "");
        if (!stable) return json({ success:false, message:"House 2 has newer writes. Finish /api/failover/sync-back before failback.", latch },409);
        if (!body?.confirmPrimaryRestarted) return json({ success:false, message:"Runtime files are synced back, but TENTEN Node must be restarted before failback. Retry with confirmPrimaryRestarted=true after restarting the primary app.", latch },409);
      }
      try {
        const probe = await primaryRuntimeFetch("/api/health", env, { method:"GET", timeoutMs:15000 });
        if (!probe.ok) return json({ success:false, message:`Primary health HTTP ${probe.status}; failover remains latched.` },409);
      } catch (error) { return json({ success:false, message:`Primary health failed: ${safeText(error?.message || String(error),180)}; failover remains latched.` },409); }
      return json({ success:true, latch:await writeFailoverLatch(env,{active:false,dirty:false,clearedAt:new Date().toISOString(),reason:"manual-safe-failback",syncBackCompletedAt:"",syncBackDirtyAt:""}) });
    }
    if (url.pathname === "/api/house2-node-health") {
      if (!await authorizeFullRuntimeSync(request, env)) return json({ success:false, message:"Unauthorized." },401);
      try {
        const probe = new Request(`${PUBLIC_SITE_ORIGIN}/api/health`, { method:"GET", headers:{"x-kbl-house2-probe":"1"} });
        return await fetchHouse2Container(probe, env, "direct-health-probe");
      } catch (error) { return json({ success:false, message:safeText(error?.message || String(error),240), containerConfigured:house2ContainerConfigured(env) },503); }
    }
    if (url.pathname === "/api/health") {
      const d1 = await checkD1(env);
      let goldPrice = null;
      let catalog = null;
      let mediaState = null;
      let siteMirrorState = null;
      let siteAssetMirrorState = null;
      let fullRuntimeState = null;
      let failoverLatch = null;
      let syncBackState = null;
      if (d1.connected) {
        try { goldPrice = publicGoldPrice(await getGoldPrice(env)); } catch (_) {}
        try { catalog = publicCatalogSnapshot(await getCatalogSnapshot(env)); } catch (_) {}
      }
      // The full Node twin is R2-backed and must not be gated by the tertiary D1 mirror.
      if (env.MEDIA) {
        try { mediaState = await readMediaState(env); } catch (_) {}
        try { siteMirrorState = await readSiteMirrorState(env); } catch (_) {}
        try { siteAssetMirrorState = await readSiteAssetMirrorState(env); } catch (_) {}
        try { fullRuntimeState = await readJsonR2(env, FULL_RUNTIME_SYNC_STATE_KEY, null); } catch (_) {}
        try { failoverLatch = await readFailoverLatch(env, true); } catch (_) {}
        try { syncBackState = await readJsonR2(env, FULL_RUNTIME_SYNC_BACK_STATE_KEY, null); } catch (_) {}
      }
      const siteMirror = publicSiteMirrorState(siteMirrorState, siteAssetMirrorState);
      const fullUiFailoverReady = Boolean(goldPrice && catalog?.productCount && mediaState?.ready && siteMirror.ready && siteMirror.assetMirrorReady && primaryOriginIsDistinct(env));
      const fullNodeRuntimeReady = Boolean(house2ContainerConfigured(env) && fullRuntimeState?.ready && primaryOriginIsDistinct(env));
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
        siteMirror,
        siteMirrorReady: Boolean(siteMirror.ready),
        sameGitPublicAssets: Boolean(env.ASSETS),
        r2FrontendAssetMirrorReady: Boolean(siteMirror.assetMirrorReady),
        independentBackupData: Boolean(goldPrice && catalog?.productCount && mediaState?.ready),
        failoverProxyCodeReady: true,
        fullUiFailoverReady,
        fullNodeRuntimeReady,
        fullRuntimeState,
        failoverLatch,
        syncBackState: fullRuntimeSyncBackPublic(syncBackState),
        house2Runtime: fullNodeRuntimeReady ? "same-node-app-container" : "not-ready",
        house2ContainerName: house2ContainerName(env),
        workerVersionId: safeText(env?.CF_VERSION_METADATA?.id || "", 100),
        primaryOriginUrl: primaryOriginFor(env),
        primaryOriginSeparated: primaryOriginIsDistinct(env),
        readyForFailover: fullNodeRuntimeReady,
        message: fullNodeRuntimeReady ? "House 2 full Node twin is ready: same app code, R2-backed runtime state and automatic failover latch." : d1.connected ? "House 2 mirror layers are online; full Node twin still needs runtime state/container secrets." : "Worker is online, but D1 is not healthy."
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
    if (url.pathname === "/api/sync/site-mirror" && request.method === "POST") {
      if (!await authorizeMediaSync(request, env)) return json({ success: false, message: "Unauthorized." }, 401);
      const minute = await syncSiteMirror(env, SITE_MIRROR_MINUTE_TARGETS, "manual-minute");
      const five = await syncSiteMirror(env, SITE_MIRROR_FIVE_MINUTE_TARGETS, "manual-full");
      const assets = await syncDiscoveredSiteAssets(env);
      return json({ success: true, message: "House 2 UI/API/assets mirror synchronized.", minute, five, assets });
    }
    if (url.pathname === "/api/site-mirror-status") {
      const state = await readSiteMirrorState(env);
      const assetState = await readSiteAssetMirrorState(env);
      return json({ success: true, siteMirror: publicSiteMirrorState(state, assetState) });
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
      let siteMirrorState = null;
      let siteAssetMirrorState = null;
      let fullRuntimeState = null;
      let failoverLatch = null;
      let syncBackState = null;
      if (d1.connected) {
        try { goldPrice = publicGoldPrice(await getGoldPrice(env)); } catch (_) {}
        try { catalog = publicCatalogSnapshot(await getCatalogSnapshot(env)); } catch (_) {}
      }
      // The full Node twin is R2-backed and must not be gated by the tertiary D1 mirror.
      if (env.MEDIA) {
        try { mediaState = await readMediaState(env); } catch (_) {}
        try { siteMirrorState = await readSiteMirrorState(env); } catch (_) {}
        try { siteAssetMirrorState = await readSiteAssetMirrorState(env); } catch (_) {}
        try { fullRuntimeState = await readJsonR2(env, FULL_RUNTIME_SYNC_STATE_KEY, null); } catch (_) {}
        try { failoverLatch = await readFailoverLatch(env, true); } catch (_) {}
        try { syncBackState = await readJsonR2(env, FULL_RUNTIME_SYNC_BACK_STATE_KEY, null); } catch (_) {}
      }
      const siteMirror = publicSiteMirrorState(siteMirrorState, siteAssetMirrorState);
      const fullUiFailoverReady = Boolean(goldPrice && catalog?.productCount && mediaState?.ready && siteMirror.ready && siteMirror.assetMirrorReady && primaryOriginIsDistinct(env));
      const fullNodeRuntimeReady = Boolean(house2ContainerConfigured(env) && fullRuntimeState?.ready && primaryOriginIsDistinct(env));
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
        siteMirror,
        siteMirrorReady: Boolean(siteMirror.ready),
        r2FrontendAssetMirrorReady: Boolean(siteMirror.assetMirrorReady),
        productionDataSynced: Boolean(goldPrice && catalog?.productCount && mediaState?.ready),
        automaticFailover: primaryOriginIsDistinct(env),
        failoverProxyCodeReady: true,
        fullUiFailoverReady,
        fullNodeRuntimeReady,
        fullRuntimeState,
        failoverLatch,
        syncBackState: fullRuntimeSyncBackPublic(syncBackState),
        house2Runtime: fullNodeRuntimeReady ? "same-node-app-container" : "not-ready",
        house2ContainerName: house2ContainerName(env),
        workerVersionId: safeText(env?.CF_VERSION_METADATA?.id || "", 100),
        primaryOriginUrl: primaryOriginFor(env),
        primaryOriginSeparated: primaryOriginIsDistinct(env),
        readyForProductionTraffic: fullNodeRuntimeReady
      });
    }
    if (url.pathname.startsWith("/api/")) {
      const mirroredApi = await backupApiFromMirror(request, env);
      if (mirroredApi) return mirroredApi;
      return json({
        success: false,
        message: "Backup API route not implemented yet."
      }, 404);
    }
    const directAsset = await serveStaticAssetFallback(request, env);
    if (directAsset) return directAsset;
    const directPage = await serveMirroredPage(request, env, url.pathname);
    if (directPage) return directPage;
    return renderBackupHome(env, url.pathname.startsWith("/en") ? "en" : "vi");
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const latch = await readFailoverLatch(env, true);
        if (latch?.active) {
          try {
            const probe = new Request(`${PUBLIC_SITE_ORIGIN}/api/health`, { method:"GET", headers:{"x-kbl-house2-keepalive":"1"} });
            await fetchHouse2Container(probe, env, "failover-keepalive");
          } catch (error) { console.warn("KBL HOUSE2 KEEPALIVE:", error?.message || String(error)); }
        } else if (event.cron === "* * * * *") {
          await syncFullRuntimeState(env, null, "scheduled-1m");
        }
      } catch (error) { console.warn("KBL HOUSE2 FULL RUNTIME SYNC:", error?.message || String(error)); }
    })());
    if (event.cron === "*/5 * * * *") {
      ctx.waitUntil(
        pullCatalogFromPrimary(env).catch((error) => {
          console.warn("KBL BACKUP CATALOG AUTO-PULL:", error?.message || String(error));
        })
      );
      ctx.waitUntil(
        (async () => {
          try {
            await syncSiteMirror(env, SITE_MIRROR_FIVE_MINUTE_TARGETS, "scheduled-5m");
            await syncDiscoveredSiteAssets(env);
          } catch (error) {
            console.warn("KBL HOUSE2 PAGE/ASSET MIRROR 5M:", error?.message || String(error));
          }
        })()
      );
    }
    if (event.cron === "* * * * *") {
      ctx.waitUntil(
        mirrorMediaBatch(env).catch((error) => {
          console.warn("KBL BACKUP R2 MEDIA:", error?.message || String(error));
        })
      );
      ctx.waitUntil(
        (async () => {
          try {
            await syncSiteMirror(env, SITE_MIRROR_MINUTE_TARGETS, "scheduled-1m");
            const assetState = await readSiteAssetMirrorState(env);
            if (!assetState?.lastSuccessAt) await syncDiscoveredSiteAssets(env);
          } catch (error) {
            console.warn("KBL HOUSE2 UI/API MIRROR 1M:", error?.message || String(error));
          }
        })()
      );
    }
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
