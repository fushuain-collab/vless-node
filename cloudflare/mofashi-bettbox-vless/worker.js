import { connect } from "cloudflare:sockets";

const UUID = "8f3a9b2c-6d4e-4a1f-9c2b-7e8d5f0a1b3c";
const WS_PATHS = new Set(["/vless", "/" + UUID]);

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade") || "";
    if (upgrade.toLowerCase() === "websocket") {
      if (!WS_PATHS.has(url.pathname)) return new Response("Not found", { status: 404 });
      return vlessOverWSHandler(request);
    }
    if (url.pathname === "/" || url.pathname === "/health") {
      return text(`mofashi-bettbox-vless ok\nhost: ${url.host}\npath: /vless\nuuid: ${UUID}\n`);
    }
    if (["/sub", "/sub.yaml", "/bettbox", "/mihomo", "/clash"].includes(url.pathname)) {
      return new Response(makeClash(url.host), { headers: { "content-type": "text/yaml; charset=utf-8", "cache-control": "no-store" } });
    }
    if (url.pathname === "/uri") return text(makeVlessUri(url.host) + "\n");
    return new Response("Not found", { status: 404 });
  }
};

function text(s){ return new Response(s, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } }); }
function makeVlessUri(host){ return `vless://${UUID}@${host}:443?encryption=none&security=tls&sni=${host}&fp=chrome&type=ws&host=${host}&path=%2Fvless#mofashi-bettbox-vless`; }
function makeClash(host){ return `mixed-port: 7890
allow-lan: false
mode: rule
log-level: info
ipv6: false
unified-delay: true
tcp-concurrent: true
dns:
  enable: true
  ipv6: false
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  default-nameserver:
    - 223.5.5.5
    - 119.29.29.29
  nameserver:
    - https://dns.alidns.com/dns-query
    - https://doh.pub/dns-query
proxies:
  - name: MOFASHI-BETTBOX-VLESS
    type: vless
    server: ${host}
    port: 443
    uuid: ${UUID}
    network: ws
    tls: true
    udp: false
    servername: ${host}
    client-fingerprint: chrome
    skip-cert-verify: false
    ws-opts:
      path: /vless
      headers:
        Host: ${host}
proxy-groups:
  - name: PROXY
    type: select
    proxies:
      - MOFASHI-BETTBOX-VLESS
      - DIRECT
rules:
  - MATCH,PROXY
`; }

async function vlessOverWSHandler(request) {
  const pair = new WebSocketPair();
  const [client, ws] = Object.values(pair);
  ws.accept();
  let remote = null;
  let responseHeader = null;
  let closed = false;
  const closeAll = () => {
    if (closed) return; closed = true;
    try { remote && remote.close(); } catch {}
    try { ws.close(); } catch {}
  };
  ws.addEventListener("message", async (event) => {
    try {
      const data = event.data instanceof ArrayBuffer ? event.data : await event.data.arrayBuffer();
      if (!remote) {
        const parsed = processVlessHeader(data);
        if (parsed.hasError) throw new Error(parsed.message);
        responseHeader = parsed.vlessResponseHeader;
        remote = connect({ hostname: parsed.addressRemote, port: parsed.portRemote });
        remoteToWS(remote, ws, responseHeader, closeAll);
        const writer = remote.writable.getWriter();
        if (parsed.rawClientData && parsed.rawClientData.byteLength > 0) await writer.write(parsed.rawClientData);
        writer.releaseLock();
      } else {
        const writer = remote.writable.getWriter();
        await writer.write(data);
        writer.releaseLock();
      }
    } catch(e) { closeAll(); }
  });
  ws.addEventListener("close", closeAll);
  ws.addEventListener("error", closeAll);
  return new Response(null, { status: 101, webSocket: client });
}

async function remoteToWS(remote, ws, header, closeAll) {
  try {
    const reader = remote.readable.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (ws.readyState !== 1) break;
      if (header) {
        const merged = new Uint8Array(header.byteLength + value.byteLength);
        merged.set(new Uint8Array(header), 0);
        merged.set(new Uint8Array(value), header.byteLength);
        ws.send(merged.buffer);
        header = null;
      } else ws.send(value);
    }
  } catch(e) {} finally { closeAll(); }
}

function processVlessHeader(buf) {
  if (buf.byteLength < 24) return { hasError: true, message: "invalid data" };
  const view = new DataView(buf);
  const version = view.getUint8(0);
  const uuid = stringify(new Uint8Array(buf.slice(1,17)));
  if (uuid !== UUID) return { hasError: true, message: "invalid uuid " + uuid };
  const optLen = view.getUint8(17);
  const command = view.getUint8(18 + optLen);
  if (command !== 1) return { hasError: true, message: "only tcp supported" };
  let offset = 19 + optLen;
  const portRemote = view.getUint16(offset); offset += 2;
  const addressType = view.getUint8(offset++);
  let addressRemote = "";
  if (addressType === 1) { addressRemote = Array.from(new Uint8Array(buf.slice(offset, offset+4))).join("."); offset += 4; }
  else if (addressType === 2) { const len = view.getUint8(offset++); addressRemote = new TextDecoder().decode(buf.slice(offset, offset+len)); offset += len; }
  else if (addressType === 3) { const bytes = new Uint8Array(buf.slice(offset, offset+16)); const parts=[]; for(let i=0;i<16;i+=2) parts.push(((bytes[i]<<8)|bytes[i+1]).toString(16)); addressRemote=parts.join(":"); offset += 16; }
  else return { hasError: true, message: "invalid address type" };
  return { hasError:false, addressRemote, portRemote, rawClientData: buf.slice(offset), vlessResponseHeader: new Uint8Array([version,0]).buffer };
}
function stringify(arr){ const h=Array.from(arr,b=>b.toString(16).padStart(2,"0")).join(""); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; }
