import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
const root = path.resolve(import.meta.dirname, '..');
const core = fs.readFileSync(path.join(root, 'lib/kbl/widget-core.mjs'), 'utf8');
const template = fs.readFileSync(path.join(root, 'scripts/scriptable-widget.template.js'), 'utf8');
const output = path.join(root, 'public/tien-ich/widget-kbl');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'gold-core.mjs'), core);
for (const [theme, suffix, name] of [['copper', 'Dong', 'KBL Gia Vang Dong']]) {
  const script = template.replace('__KBL_THEME__', theme).replace('__KBL_CORE__', core.replace(/^export /gm, '')).replace('__KBL_BACKGROUND__', fs.readFileSync(path.join(output, 'assets/widget-peach.jpg')).toString('base64')).replace('__KBL_LOGO__', fs.readFileSync(path.join(output, 'assets/kbl-logo.png')).toString('base64'));
  fs.writeFileSync(path.join(output, `KBL_Gia_Vang_${suffix}.js`), script);
  fs.writeFileSync(path.join(output, `KBL_Gia_Vang_${suffix}.txt`), script);
  fs.writeFileSync(path.join(output, 'install-manifest.json'), JSON.stringify({ version: 1, name, file: `KBL_Gia_Vang_${suffix}.js`, bytes: Buffer.byteLength(script), sha256: createHash('sha256').update(script).digest('hex') }, null, 2));
  fs.writeFileSync(path.join(output, `KBL_Gia_Vang_${suffix}.scriptable`), JSON.stringify({ always_run_in_app: false, icon: { color: theme === 'navy' ? 'deep-blue' : 'yellow', glyph: 'chart-line' }, name, script, share_sheet_inputs: [] }, null, 2));
}
console.log('Generated the approved peach/copper self-contained Scriptable widget and matching browser price parser.');

const native=fs.readFileSync(path.join(output,'KBL_Gia_Vang_Dong.js'));
const blobSha=createHash('sha1').update(Buffer.from('blob '+native.length+'\0')).update(native).digest('hex');
const rescue = fs.readFileSync(path.join(root, 'scripts/scriptable-rescue.template.js'), 'utf8').replace('__KBL_WIDGET_BLOB_SHA__',blobSha).replace('__KBL_WIDGET_BYTES__',String(native.length)).replace('__KBL_WIDGET_LENGTH__',String(native.toString('utf8').length));
fs.writeFileSync(path.join(root,'scripts/scriptable-rescue.js'),rescue);
fs.writeFileSync(path.join(output, 'KBL_Cai_Widget.txt'), rescue);
