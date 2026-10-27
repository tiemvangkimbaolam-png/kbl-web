const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
for (const name of ['index.html','pawn.html','setup.html']) {
  const html = fs.readFileSync(path.join(root, name), 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  scripts.forEach((code, i) => new vm.Script(code, { filename: `${name}#inline-${i+1}` }));
  console.log(`[PASS] ${name}: ${scripts.length} inline script(s)`);
}
