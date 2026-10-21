// Read-only static test server under the actual GitHub project URL prefix.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist-demo'),prefix='/hpw_ARB/';
const port=Number(process.env.DEMO_TEST_PORT||5051);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css'};
http.createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(!pathname.startsWith(prefix))throw new Error();
    const file=path.resolve(root,decodeURIComponent(pathname.slice(prefix.length)||'index.html'));
    if(!file.startsWith(root+path.sep))throw new Error();
    const data=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream'});res.end(data);
  }catch{res.writeHead(404);res.end('Not found');}
}).listen(port,'127.0.0.1');
