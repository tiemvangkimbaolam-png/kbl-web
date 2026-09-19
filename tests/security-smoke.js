'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),pub=path.join(root,'public');
for(const bad of ['.env','data','publisher-connectors.json','publisher-secrets.key']){const p=path.join(pub,bad);if(fs.existsSync(p))throw new Error('Sensitive path under public/: '+bad)}
// Server source must never be copied under the public web root.
if(fs.existsSync(path.join(pub,'app.js')))throw new Error('Server app.js must not be exposed under public/');
for(const f of fs.readdirSync(pub)){const full=path.join(pub,f);if(!fs.statSync(full).isFile())continue;const text=fs.readFileSync(full,'utf8');if(text.includes("require('express')")||text.includes('KBL_ADMIN_TOKEN'))throw new Error('Possible server/secrets source exposed under public/: '+f)}
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
for(const guard of ['KBL_DATA_DIR không được nằm trong thư mục public/','requireAdmin','publisher-secrets.key'])if(!app.includes(guard))throw new Error('Missing security guard '+guard);
const gitignore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
if(!gitignore.includes('.env')||!gitignore.includes('data/'))throw new Error('.gitignore must exclude .env and data/');
console.log('SECURITY_SMOKE_OK');
