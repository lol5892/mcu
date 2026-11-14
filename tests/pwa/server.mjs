import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
const root=await mkdtemp(join(tmpdir(),'marvel-pwa-'));
const bundle=await build({stdin:{contents:`import { startPwaUpdates } from './src/pwa/lifecycle'; import { setUpdateBlocker } from './src/pwa/safety'; window.block=(name,value)=>setUpdateBlocker(name,value); startPwaUpdates('/mcu/',200);`, resolveDir:process.cwd()},bundle:true,write:false,format:'iife',target:'es2022'});
for(const version of ['v1','v2','v3']){
 const path=join(root,version);await mkdir(join(path,'assets'),{recursive:true});
 await writeFile(join(path,'index.html'),`<!doctype html><html><head><meta charset="utf-8"><title>Our Marvel ${version}</title></head><body><h1>${version}</h1><label>Черновик<textarea></textarea></label><script src="./assets/runtime-${version}.js"></script></body></html>`);
 await writeFile(join(path,'assets',`runtime-${version}.js`),bundle.outputFiles[0].contents);
 await copyFile('public/covers-v25/iron-man.webp',join(path,'assets','catalogue-poster.webp'));
 await copyFile('public/sw-family.js',join(path,'sw-family.js'));
 await copyFile('public/manifest.webmanifest',join(path,'manifest.webmanifest'));
 execFileSync(process.execPath,['scripts/build-sw.mjs'],{env:{...process.env,MV_DIST_DIR:path},stdio:'pipe'});
}
let version='v1', broken=false, requests=0,artworkRequests=0;
createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/health'){res.end('ok');return;}
 if(url.pathname==='/__release'){version=url.searchParams.get('version')||'v1';broken=url.searchParams.get('broken')==='1';res.end('ok');return;}
 if(url.pathname==='/__stats'){res.end(JSON.stringify({requests,artworkRequests}));return;}
 if(!url.pathname.startsWith('/mcu/')){res.writeHead(404);res.end();return;}
 let file=url.pathname.slice('/mcu/'.length)||'index.html';
 if(file.includes('..')){res.writeHead(403);res.end();return;}
 if(file==='sw.js')requests++;
 if(file==='assets/catalogue-poster.webp')artworkRequests++;
 if(broken&&file.startsWith('assets/')){res.writeHead(503);res.end('mobile download interrupted');return;}
 try{const data=await readFile(resolve(root,version,file));res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':'application/json');res.end(data);}catch{res.writeHead(404);res.end('missing');}
}).listen(4187,'127.0.0.1');
