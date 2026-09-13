import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import WebSocket,{WebSocketServer} from 'ws';
import {createMeter} from './capacity-meter.mjs';
const meter=createMeter();
const target=new URL(process.env.CONVEX_SELF_HOSTED_URL);
if(target.href!=='https://artificiallabs-convex.bebra42.ru/')throw Error('QA target mismatch');
const report=process.env.E2E_REPORT_DIR;
function persist(){if(report)fs.writeFileSync(report+'/network-total.json',JSON.stringify(meter.snapshot(),null,2),{mode:0o600});}
const servers=[];
for(const [port,secure] of [[3350,false],[3351,false],[3352,Boolean(process.env.E2E_CONVEX_TLS_CERT)]]){
 const handler=(req,res)=>{
  if(req.url==='/__e2e_proxy_health'){res.writeHead(204).end();return;}
  if(req.url==='/__capacity'){res.setHeader('content-type','application/json');res.end(JSON.stringify(meter.snapshot()));return;}
  if(req.url==='/__capacity_reset'&&req.method==='POST'){meter.reset();res.writeHead(204).end();return;}
  // All actual client API traffic must use WebSocket; prohibit sending external messages via HTTP actions.
  meter.inc('http');
  if(req.method!=='GET'){meter.inc('httpErrors');res.writeHead(403).end('QA HTTP write blocked');return;}
  const upstream=https.request(new URL(req.url,target),{headers:{host:target.host},timeout:15000},r=>{if(r.statusCode>=400)meter.inc('httpErrors');res.writeHead(r.statusCode);r.pipe(res);});
  upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{meter.inc('httpErrors');if(!res.headersSent)res.writeHead(502);res.end();});upstream.end();
 };
 const server=secure?https.createServer({key:fs.readFileSync(process.env.E2E_CONVEX_TLS_KEY),cert:fs.readFileSync(process.env.E2E_CONVEX_TLS_CERT)},handler):http.createServer(handler);
 const wss=new WebSocketServer({noServer:true,perMessageDeflate:false,maxPayload:8*1024*1024});
 server.on('upgrade',(req,socket,head)=>wss.handleUpgrade(req,socket,head,client=>{
  meter.inc('wsConnections');const queries=new Map(),queue=[];
  const url=new URL(req.url,target);url.protocol='wss:';
  const upstream=new WebSocket(url,{perMessageDeflate:false,maxPayload:8*1024*1024});
  client.on('message',(data,isBinary)=>{
   meter.message(data,'client',queries);
   let message;try{message=JSON.parse(data.toString());}catch{client.close();return;}
   if(message.type==='Action'){
    const path=message.udfPath?.replace('.js:',':');
    const auth=path==='auth:signIn'&&(message.args?.[0]?.refreshToken||(message.args?.[0]?.provider==='password'&&message.args?.[0]?.params?.flow==='signIn'));
    if(!auth&&!['smsAuth:status'].includes(path)){
     meter.inc('blockedActions');client.send(JSON.stringify({type:'ActionResponse',requestId:message.requestId,success:false,result:'QA_EXTERNAL_ACTION_BLOCKED',logLines:[]}));return;
    }
   }
   if(upstream.readyState===WebSocket.OPEN)upstream.send(data,{binary:isBinary});else if(queue.length<100)queue.push([data,isBinary]);else client.close();
  });
  upstream.on('open',()=>{for(const [data,binary] of queue)upstream.send(data,{binary});queue.length=0;});
  upstream.on('message',(data,isBinary)=>{meter.message(data,'server',queries);if(client.readyState===WebSocket.OPEN)client.send(data,{binary:isBinary});});
  upstream.on('error',()=>{meter.inc('wsUpstreamErrors');client.close();});
  client.on('error',()=>upstream.close());client.on('close',()=>{queue.length=0;upstream.close();});upstream.on('close',()=>client.close());
 }));
 server.listen(port,'127.0.0.1');servers.push(server);
}
setInterval(persist,1000).unref();
process.on('SIGTERM',()=>{persist();process.exit(0);});
console.log('Aggregate-only capacity proxy ready');
