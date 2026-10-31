import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const core = fs.readFileSync(path.join(root, 'lib/kbl/widget-core.mjs'), 'utf8');
const template = fs.readFileSync(path.join(root, 'scripts/scriptable-widget.template.js'), 'utf8');
const output = path.join(root, 'public/tien-ich/widget-kbl');
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'gold-core.mjs'), core);
for (const [theme, suffix, name] of [['copper', 'Dong', 'KBL Gia Vang Dong']]) {
  const script = template.replace('__KBL_THEME__', theme).replace('__KBL_CORE__', core.replace(/^export /gm, '')).replace('__KBL_BACKGROUND__', fs.readFileSync(path.join(output, 'assets/widget-peach.jpg')).toString('base64')).replace('__KBL_LOGO__', fs.readFileSync(path.join(output, 'assets/kbl-logo.png')).toString('base64'));
  fs.writeFileSync(path.join(output, `KBL_Gia_Vang_${suffix}.js`), script);
  fs.writeFileSync(path.join(output, `KBL_Gia_Vang_${suffix}.scriptable`), JSON.stringify({ always_run_in_app: false, icon: { color: theme === 'navy' ? 'deep-blue' : 'yellow', glyph: 'chart-line' }, name, script, share_sheet_inputs: [] }, null, 2));
}
console.log('Generated the approved peach/copper self-contained Scriptable widget and matching browser price parser.');
