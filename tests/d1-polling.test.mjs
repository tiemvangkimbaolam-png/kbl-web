// Execute actual TSX effects with hook/transport mocks; this is not a browser/device test.
import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
let components;
before(async()=>{
 const {build}=createRequire(fs.realpathSync('node_modules/wrangler/package.json'))('esbuild');
 await build({stdin:{contents:"export {default as TV} from './app/tv/page';export {default as PriceHistory} from './app/components/price-history';export {default as PublicData} from './app/components/public-data';",resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',jsx:'automatic',outfile:'.sites-runtime/d1-polling-tests.mjs',plugins:[{name:'hooks',setup(b){
 b.onResolve({filter:/^lucide-react$/},()=>({path:'icons',namespace:'icons'}));
 b.onLoad({filter:/.*/,namespace:'icons'},()=>({contents:'export const ArrowLeft=()=>null,ArrowUpRight=()=>null,RefreshCw=()=>null;'}));
 b.onResolve({filter:/^(react|react\/jsx-runtime)$/},a=>({path:a.path,namespace:'hooks'}));
 b.onLoad({filter:/.*/,namespace:'hooks'},a=>({contents:a.path==='react'?`export const useState=v=>{const h=globalThis.__HOOKS,i=h.index++;return [i in h.values?h.values[i]:(typeof v==='function'?v():v),()=>{}]};export const useRef=v=>({current:v});export const useEffect=f=>globalThis.__HOOKS.effects.push(f);`:`export const jsx=(type,props)=>({type,props});export const jsxs=jsx;export const Fragment='fragment';`}));
 b.onResolve({filter:/^(\.\/ui|\.\/tradingview-market|\.\.\/components\/tv-board)$/},a=>({path:a.path,namespace:'transport'}));
 b.onLoad({filter:/.*/,namespace:'transport'},()=>({contents:`export const api=async p=>{globalThis.__HOOKS.requests.push(p);return {vietnam:[],world:[]}};export const Brand=()=>null,Empty=()=>null,TVBoard=()=>null,cash=String,date=String;export default ()=>null;`}));
 }}]});
 components=await import(pathToFileURL(path.resolve('.sites-runtime/d1-polling-tests.mjs'))+'?'+Date.now());
});
function setup(values=[]){const h={values,index:0,effects:[],requests:[],timers:[]};globalThis.__HOOKS=h;globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}};globalThis.window={addEventListener(){},removeEventListener(){}};globalThis.setInterval=fn=>{h.timers.push(fn);return h.timers.length;};globalThis.clearInterval=()=>{};globalThis.fetch=async p=>{h.requests.push(p);return{ok:true,json:async()=>({design:{},prices:[]})}};return h;}
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
test('TV effect polls only quotes and design, with no hidden-tab polling',async()=>{const h=setup();components.TV();const stop=h.effects[0]();await settle();assert.deepEqual(h.requests,['/api/public/prices?view=tv','/api/public/tv-design']);document.hidden=true;h.timers[0]();await settle();assert.equal(h.requests.length,2);stop();});
test('world chart effect avoids D1 history; VN chart asks only for daily shop series',async()=>{let h=setup(['world','7']);components.PriceHistory();let stop=h.effects[0]();await settle();assert.deepEqual(h.requests,['public/fx']);stop();h=setup(['vn','7']);components.PriceHistory();stop=h.effects[0]();await settle();assert.deepEqual(h.requests,['public/price-history?days=7&series=vn']);document.hidden=true;h.timers[0]();await settle();assert.equal(h.requests.length,1);stop();});
test('standalone public price page does not load the product catalog',async()=>{const h=setup();components.PublicData({kind:'prices'});const stop=h.effects[0]();await settle();assert.deepEqual(h.requests,['public/prices']);stop();});
test('TV world reference has its own non-D1 endpoint and stops polling while hidden',async()=>{const h=setup();components.TV();const stop=h.effects[1]();await settle();assert.deepEqual(h.requests,['/api/public/market']);document.hidden=true;h.timers[0]();await settle();assert.equal(h.requests.length,1);stop();});
