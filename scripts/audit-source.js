'use strict';
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const required = ['app.js','package.json','package-lock.json','modules','views','public'];
const missing = required.filter(name => !fs.existsSync(path.join(root,name)));
if (missing.length) {
  console.error('Missing required source paths:', missing.join(', '));
  process.exit(1);
}
const app = fs.readFileSync(path.join(root,'app.js'),'utf8');
const moduleRefs = [...app.matchAll(/require\(['"]\.\/modules\/([^'"]+)['"]\)/g)].map(m => m[1]);
const missingModules = [...new Set(moduleRefs)].filter(name => {
  const base = path.join(root,'modules',name);
  return !fs.existsSync(base) && !fs.existsSync(base + '.js');
});
if (missingModules.length) {
  console.error('Missing required modules:', missingModules.join(', '));
  process.exit(1);
}
console.log(`Source audit OK: ${new Set(moduleRefs).size} local module reference(s) resolved.`);
