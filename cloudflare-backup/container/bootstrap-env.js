'use strict';

function applyBundle() {
  const raw = String(process.env.KBL_HOUSE2_ENV_BUNDLE || '').trim();
  if (!raw) return;
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (error) {
    console.error('KBL HOUSE2: invalid KBL_HOUSE2_ENV_BUNDLE JSON:', error.message);
    process.exit(73);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    console.error('KBL HOUSE2: environment bundle must be a JSON object.');
    process.exit(73);
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
    if (value === undefined || value === null) continue;
    process.env[key] = String(value);
  }
}

applyBundle();

// House 2 runtime invariants always override copied House 1 values.
process.env.NODE_ENV = 'production';
process.env.PORT = '3000';
process.env.HOST = '0.0.0.0';
process.env.KBL_HOUSE2_RUNTIME = '1';
process.env.KBL_DATA_DIR = '/mnt/kbl-r2/full-runtime/data';
process.env.KBL_PUBLIC_BASE_URL = 'https://tiemvangkimbaolam.id.vn';
process.env.KBL_PUBLISHER_PUBLIC_BASE_URL = 'https://tiemvangkimbaolam.id.vn';

require('/app/app.js');
