import { connect } from "cloudflare:sockets";

const UUID = "e0240134-0986-4b92-a230-fdc8d1200456";
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
      return new Response(makeConfig(url.host), {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};

function makeConfig(host) {
  return `vless://${UUID}@${host}:443?encryption=none&security=tls&sni=${host}&fp=chrome&type=ws&host=${host}&path=%2F${UUID}#edgetunnel-proxy`;
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
