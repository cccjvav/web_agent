'use strict';
// Public HTTPS only. Resolve every request, reject mixed/private DNS, pin the socket lookup.
const net = require('net');
const https = require('https');
const dns = require('dns').promises;
const { Readable } = require('stream');
const blocked = new net.BlockList();
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(address,prefix,'ipv4');
for (const [address,prefix] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]]) blocked.addSubnet(address,prefix,'ipv6');
const global6 = new net.BlockList();global6.addSubnet('2000::',3,'ipv6');
function isPublic(address) {
  const family=net.isIP(address);
  return family===4 ? !blocked.check(address,'ipv4') : family===6 && global6.check(address,'ipv6') && !blocked.check(address,'ipv6');
}
async function resolvePublic(hostname, signal, lookup = dns.lookup.bind(dns)) {
  signal?.throwIfAborted();
  const host=hostname.replace(/^\[|\]$/g,'');
  let abort;
  const interrupted=new Promise((_,reject)=>{abort=()=>reject(Error('Public HTTPS request cancelled'));signal?.addEventListener('abort',abort,{once:true});});
  try {
    const addresses=await Promise.race([net.isIP(host) ? Promise.resolve([{address:host,family:net.isIP(host)}]) : lookup(host,{all:true,verbatim:true}),interrupted]);
    signal?.throwIfAborted();
    if (!Array.isArray(addresses) || !addresses.length || addresses.length>32 || addresses.some(item=>!isPublic(item.address) || item.family!==net.isIP(item.address))) throw Error('Public HTTPS DNS includes a non-public or invalid address');
    return addresses[0];
  } finally {signal?.removeEventListener('abort',abort);}
}
async function post(url, {headers,body,signal}, dependencies = {}) {
  const target=new URL(url);
  if (target.protocol!=='https:' || target.username || target.password || target.search || target.hash) throw Error('Public MCP requires HTTPS without URL credentials, query or fragment');
  const selected=await resolvePublic(target.hostname,signal,dependencies.lookup);
  signal?.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const request=(dependencies.request || https.request)(target, {
      method:'POST',agent:false,signal,rejectUnauthorized:true,
      headers:{...headers,'Accept-Encoding':'identity'},
      lookup(_hostname,options,callback) {
        // No second DNS query; preserve URL hostname for HTTP Host and TLS certificate/SNI.
        callback(null,options?.all ? [selected] : selected.address,selected.family);
      }
    }, response=>{
      const responseHeaders=new Headers();
      for (const [key,value] of Object.entries(response.headers)) if(value!==undefined) responseHeaders.set(key,Array.isArray(value)?value.join(', '):value);
      resolve({ok:response.statusCode>=200 && response.statusCode<300,status:response.statusCode,headers:responseHeaders,body:Readable.toWeb(response)});
    });
    request.once('error',reject);
    request.end(body);
  });
}
module.exports={isPublic,resolvePublic,post};
