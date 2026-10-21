import {readFile,readdir,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('dist-demo');
await rename(path.join(root,'demo.html'),path.join(root,'index.html'));
const files=await readdir(root,{recursive:true});
assert(files.includes('index.html'),'Demo index missing');
let all='';
for(const name of files){
  if(!/\.(html|js|css)$/.test(name)){
    assert(!/\.(map|xlsx|sqlite|db|json|py)$/.test(name)&&!name.startsWith('.env'),'Unexpected published file');
    continue;
  }
  all+=await readFile(path.join(root,name),'utf8');
}
const html=await readFile(path.join(root,'index.html'),'utf8');
assert(html.includes("connect-src 'none'"),'Demo must not make API/analytics connections');
assert(html.includes('noindex,nofollow'),'Demo indexing policy missing');
assert(/src="\.\/assets\//.test(html),'Use relative assets for GitHub repository paths');
assert(!/https?:\/\/127\.0\.0\.1|localhost:8000|DATABASE_URL|POSTGRES_PASSWORD|BUDGET_AUTH_SIGNING_KEY|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/.test(all),'Unexpected server configuration in artifact');
try{
  const backend=await readFile('../backend/app/main.py','utf8');
  const names=backend.match(/DEFAULT_HOTEL_NAMES\s*=\s*\[([\s\S]*?)\]/)?.[1]??'';
  for(const match of names.matchAll(/'([^']+)'/g))assert(!all.includes(match[1]),'Private seed name found in public artifact');
}catch(e){if(e.code!=='ENOENT')throw e;}
await writeFile(path.join(root,'.nojekyll'),'');
console.log('PASS: relative static assets, no API connections/configuration, no private hotel seed names');
