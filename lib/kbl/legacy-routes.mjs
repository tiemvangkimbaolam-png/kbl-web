// Only aliases for existing pages. Unknown paths retain a genuine 404.
const pages = new Set([
  "tv",
  "bang-gia",
  "tin-tuc",
  "dang-nhap",
  "khach-hang",
  "tra-cuu",
  "gio-hang",
  "chinh-sach",
]);
const policies = new Set([
  "bo-chinh-sach.html",
  "chinh-sach-bao-hanh-doi-tra.html",
  "chinh-sach-bao-mat.html",
  "chinh-sach-gia.html",
  "chinh-sach-giao-hang-doi-tra-hoan-tien.html",
  "chinh-sach-thanh-toan.html",
  "chinh-sach-tri-an-khach-hang-than-thiet",
  "chinh-sach-van-chuyen-giao-nhan.html",
  "dieu-kien-han-che-cung-cap-hang-hoa-dich-vu.html",
  "hinh-thuc-ho-tro-truc-tuyen.html",
  "huong-dan-mua-hang.html",
  "quy-trinh-tiep-nhan-giai-quyet-khieu-nai.html",
  "thong-tin-doanh-nghiep.html",
]);
export function legacyRoute(parts = [], query = {}) {
  if (
    !Array.isArray(parts) ||
    parts.some(
      (p) =>
        typeof p !== "string" ||
        !p ||
        p === "." ||
        p === ".." ||
        /[\\/\u0000-\u001f]/.test(p),
    )
  )
    return null;
  let path = parts;
  const localized = path[0] === "vi";
  if (localized) path = path.slice(1);
  let target = null,
    hash = "";
  if (localized && !path.length) target = "/";
  else if (path.length === 1 && path[0] === "san-pham") {
    target = "/";
    hash = "#products";
  } else if (path.length === 2 && path[0] === "san-pham" && !localized)
    target = "/vi/san-pham/" + encodeURIComponent(path[1]);
  else if (
    localized &&
    ((path.length === 1 &&
      (pages.has(path[0]) ||
        policies.has(path[0]) ||
        policies.has(path[0] + ".html"))) ||
      (path.length === 2 && ["tin-tuc", "bao-hanh"].includes(path[0])) ||
      path[0] === "admin")
  )
    target = "/" + path.map(encodeURIComponent).join("/");
  if (!target) return null;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) v.forEach((x) => params.append(k, String(x)));
    else if (v !== undefined) params.append(k, String(v));
  }
  return target + (params.size ? "?" + params.toString() : "") + hash;
}
