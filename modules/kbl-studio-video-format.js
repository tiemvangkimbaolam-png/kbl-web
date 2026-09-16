'use strict';

// Source geometry is independent of the approved 1080x1920 output format.
// Both scan validation and final composition use the same display geometry.
const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;

function sampleAspect(value) {
  if (value == null || value === '' || value === 'N/A' || value === '0:1') return 1;
  if (typeof value === 'number') return value > 0 && Number.isFinite(value) ? value : NaN;
  const parts = String(value).split(/[:/]/).map(Number);
  return parts.length === 2 && parts.every(n => Number.isFinite(n) && n > 0)
    ? parts[0] / parts[1] : NaN;
}

function sourceFormat(media = {}) {
  const width = Number(media.width), height = Number(media.height);
  const sar = sampleAspect(media.sampleAspectRatio);
  const rawRotation = Number(media.rotation ?? 0);
  const rotation = ((rawRotation % 360) + 360) % 360;
  const dimensionsValid = Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0;
  const orientationValid = Number.isFinite(rotation) && [0, 90, 180, 270].some(n => Math.abs(rotation - n) < .001);
  const swapsAxes = Math.abs(rotation - 90) < .001 || Math.abs(rotation - 270) < .001;
  const displayWidth = swapsAxes ? height : width * sar;
  const displayHeight = swapsAxes ? width * sar : height;
  const ratio = displayWidth / displayHeight;
  const valid = dimensionsValid && orientationValid && Number.isFinite(sar) && sar > 0
    && Number.isFinite(ratio) && Math.abs(ratio / (9 / 16) - 1) <= .005;
  return {
    version: 'KBL-RAW-AUTO-1', sourceWidth: width, sourceHeight: height,
    displayWidth, displayHeight, sampleAspectRatio: sar, rotation,
    targetWidth: TARGET_WIDTH, targetHeight: TARGET_HEIGHT, valid,
    needsResize: valid && (displayWidth !== TARGET_WIDTH || displayHeight !== TARGET_HEIGHT),
    message: valid
      ? `RAW ${width}×${height} · dọc 9:16; thành phẩm ${TARGET_WIDTH}×${TARGET_HEIGHT}.`
      : `RAW ${width || '?'}×${height || '?'} cần khung hiển thị dọc 9:16. Nhận 720×1280, 1080×1920, 2160×3840 và các mức 9:16 khác; không tự cắt mất nội dung.`,
  };
}

function requirePortrait(media) {
  const format = sourceFormat(media);
  if (!format.valid) {
    const error = new Error(format.message);
    error.status = 409;
    throw error;
  }
  return format;
}

function compositionFilter(media) {
  requirePortrait(media);
  // FFmpeg applies display rotation before filtering. Scaling precedes every
  // card/subtitle overlay, so normalized cue coordinates remain unchanged.
  return `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:flags=lanczos,setsar=1`;
}

module.exports = { TARGET_WIDTH, TARGET_HEIGHT, sampleAspect, sourceFormat, requirePortrait, compositionFilter };
