import { connect } from "cloudflare:sockets";

const UUID = "e0240134-0986-4b92-a230-fdc8d1200456";
const ENTRY_IPS = ["172.64.145.155", "172.64.144.178", "104.16.151.165"];
const WS_PATHS = new Set(["/" + UUID, "/vless"]);

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const upgrade = request.headers.get("Upgrade") || "";

    if (upgrade.toLowerCase() === "websocket") {
      if (!WS_PATHS.has(url.pathname)) {
        return new Response("Not found", { status: 404 });
      }
      return vlessOverWSHandler(request);
    }

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("edgetunnel-proxy ok\npath: /" + UUID + "\n", {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (url.pathname === "/" + UUID) {
      return new Response(makeYamlConfig(url.host), {
        headers: { "content-type": "text/yaml; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (url.pathname === "/uri") {
      return new Response(makeVlessUri(url.host) + "\n", {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};

function makeVlessUri(host) {
  return `vless://${UUID}@${host}:443?encryption=none&security=tls&sni=${host}&fp=chrome&type=ws&host=${host}&path=%2F${UUID}#edgetunnel-proxy`;
}

function makeYamlConfig(host) {
  const entries = ENTRY_IPS.map((ip, index) => `  - name: CF-NFS-Asia-${index + 1}
    type: vless
    server: ${ip}
    port: 443
    uuid: ${UUID}
    network: ws
    tls: true
    udp: true
    servername: ${host}
    client-fingerprint: chrome
    ws-opts:
      path: /${UUID}
      headers:
        Host: ${host}`).join("\n");
  const names = ENTRY_IPS.map((_, index) => `CF-NFS-Asia-${index + 1}`);
  return `mixed-port: 7890
allow-lan: false
mode: rule
log-level: warning
ipv6: false
unified-delay: true
tcp-concurrent: true
dns:
  enable: true
  ipv6: false
  enhanced-mode: redir-host
  default-nameserver:
    - 223.5.5.5
    - 119.29.29.29
  nameserver:
    - https://dns.alidns.com/dns-query
    - https://doh.pub/dns-query
  fallback:
    - https://1.1.1.1/dns-query
    - https://8.8.8.8/dns-query
proxies:
${entries}
proxy-groups:
  - name: PROXY
    type: select
    proxies:
      - AUTO
      - FALLBACK
      - ${names.join("\n      - ")}
      - DIRECT
  - name: AUTO
    type: url-test
    proxies:
      - ${names.join("\n      - ")}
    url: https://www.gstatic.com/generate_204
    interval: 300
    tolerance: 80
    lazy: false
  - name: FALLBACK
    type: fallback
    proxies:
      - ${names.join("\n      - ")}
    url: https://www.gstatic.com/generate_204
    interval: 300
    lazy: false
rules:
  - MATCH,PROXY
`;
}

async function vlessOverWSHandler(request) {
  const webSocketPair = new WebSocketPair();
  const [client, webSocket] = Object.values(webSocketPair);
  webSocket.accept();

  let remoteSocket = null;
  let vlessResponseHeader = null;
  let closed = false;

  const closeAll = () => {
    if (closed) return;
    closed = true;
    try { remoteSocket && remoteSocket.close(); } catch {}
    try { webSocket.close(); } catch {}
  };

  webSocket.addEventListener("message", async (event) => {
    try {
      const data = event.data instanceof ArrayBuffer ? event.data : await event.data.arrayBuffer();
      if (!remoteSocket) {
        const parsed = processVlessHeader(data);
        if (parsed.hasError) throw new Error(parsed.message);
        vlessResponseHeader = parsed.vlessResponseHeader;
        remoteSocket = connect({ hostname: parsed.addressRemote, port: parsed.portRemote });
        const writer = remoteSocket.writable.getWriter();
        if (parsed.rawClientData && parsed.rawClientData.byteLength > 0) {
          await writer.write(parsed.rawClientData);
        }
        writer.releaseLock();
        remoteSocketToWS(remoteSocket, webSocket, vlessResponseHeader, closeAll);
      } else {
        const writer = remoteSocket.writable.getWriter();
        await writer.write(data);
        writer.releaseLock();
      }
    } catch (e) {
      closeAll();
    }
  });

  webSocket.addEventListener("close", closeAll);
  webSocket.addEventListener("error", closeAll);

  return new Response(null, { status: 101, webSocket: client });
}

async function remoteSocketToWS(remoteSocket, webSocket, vlessResponseHeader, closeAll) {
  let header = vlessResponseHeader;
  try {
    const reader = remoteSocket.readable.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (webSocket.readyState !== 1) break;
      if (header) {
        const merged = new Uint8Array(header.byteLength + value.byteLength);
        merged.set(new Uint8Array(header), 0);
        merged.set(new Uint8Array(value), header.byteLength);
        webSocket.send(merged.buffer);
        header = null;
      } else {
        webSocket.send(value);
      }
    }
  } catch (e) {
  } finally {
    closeAll();
  }
}

function processVlessHeader(vlessBuffer) {
  if (vlessBuffer.byteLength < 24) return { hasError: true, message: "invalid data" };
  const view = new DataView(vlessBuffer);
  const version = view.getUint8(0);
  const uuidBytes = new Uint8Array(vlessBuffer.slice(1, 17));
  const uuid = stringify(uuidBytes);
  if (uuid !== UUID) return { hasError: true, message: "invalid uuid" };

  const optLength = view.getUint8(17);
  const command = view.getUint8(18 + optLength);
  if (command !== 1) return { hasError: true, message: "only tcp supported" };

  let offset = 19 + optLength;
  const portRemote = view.getUint16(offset);
  offset += 2;
  const addressType = view.getUint8(offset++);
  let addressRemote = "";

  if (addressType === 1) {
    addressRemote = Array.from(new Uint8Array(vlessBuffer.slice(offset, offset + 4))).join(".");
    offset += 4;
  } else if (addressType === 2) {
    const len = view.getUint8(offset++);
    addressRemote = new TextDecoder().decode(vlessBuffer.slice(offset, offset + len));
    offset += len;
  } else if (addressType === 3) {
    const bytes = new Uint8Array(vlessBuffer.slice(offset, offset + 16));
    const parts = [];
    for (let i = 0; i < 16; i += 2) parts.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
    addressRemote = parts.join(":");
    offset += 16;
  } else {
    return { hasError: true, message: "invalid address type" };
  }

  return {
    hasError: false,
    addressRemote,
    portRemote,
    rawClientData: vlessBuffer.slice(offset),
    vlessResponseHeader: new Uint8Array([version, 0]).buffer,
  };
}

function stringify(arr) {
  const hex = Array.from(arr, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
