import { connect } from 'cloudflare:sockets';

let userID = 'e0240134-0986-4b92-a230-fdc8d1200456';
let proxyIP = '';

export default {
  async fetch(request, env) {
    userID = env.UUID || userID;
    proxyIP = env.PROXYIP || proxyIP;

    const upgrade = request.headers.get('Upgrade');
    if (upgrade === 'websocket') {
      return handleVless(request, userID, proxyIP);
    }

    const url = new URL(request.url);
    if (url.pathname.slice(1) === userID) {
      const host = request.headers.get('Host');
      return new Response(
        `vless://${userID}@${host}:443?security=tls&type=ws&path=%2Fvless&host=${host}&sni=${host}&encryption=none#Worker-${host}`,
        { headers: { 'Content-Type': 'text/plain;charset=utf-8' } }
      );
    }
    return new Response('ok');
  }
};

async function handleVless(request, userID, proxyIP) {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();

  let tcpSocket = null;
  let headerDone = false;

  server.addEventListener('message', async ({ data }) => {
    const chunk = data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer || data);

    if (!headerDone) {
      headerDone = true;
      // parse vless: version(1) + uuid(16) + addons_len(1) + addons + cmd(1) + port(2) + addr_type(1) + addr
      const addonsLen = chunk[17];
      const cmdOffset = 18 + addonsLen;
      const port = (chunk[cmdOffset + 1] << 8) | chunk[cmdOffset + 2];
      const addrType = chunk[cmdOffset + 3];
      let addr = '';
      let addrEnd = cmdOffset + 4;
      if (addrType === 1) {          // IPv4
        addr = chunk.slice(addrEnd, addrEnd + 4).join('.');
        addrEnd += 4;
      } else if (addrType === 2) {   // domain
        const len = chunk[addrEnd];
        addr = new TextDecoder().decode(chunk.slice(addrEnd + 1, addrEnd + 1 + len));
        addrEnd += 1 + len;
      } else if (addrType === 3) {   // IPv6
        const hex = Array.from(chunk.slice(addrEnd, addrEnd + 16))
          .map(b => b.toString(16).padStart(2, '0')).join('');
        addr = hex.match(/.{1,4}/g).join(':');
        addrEnd += 16;
      }

      // send vless response header
      server.send(new Uint8Array([chunk[0], 0]));

      try {
        tcpSocket = connect({ hostname: proxyIP || addr, port });
        const writer = tcpSocket.writable.getWriter();
        await writer.write(chunk.slice(addrEnd));
        writer.releaseLock();
        tcpSocket.readable.pipeTo(new WritableStream({
          write(d) {
            if (server.readyState === WebSocket.READY_STATE_OPEN) server.send(d);
          }
        })).catch(() => { try { server.close(); } catch {} });
      } catch (e) {
        try { server.close(); } catch {}
      }
    } else if (tcpSocket) {
      const writer = tcpSocket.writable.getWriter();
      await writer.write(chunk);
      writer.releaseLock();
    }
  });

  server.addEventListener('close', () => {
    if (tcpSocket) try { tcpSocket.close(); } catch {}
  });

  return new Response(null, { status: 101, webSocket: client });
}
