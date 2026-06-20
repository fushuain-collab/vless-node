import { connect } from 'cloudflare:sockets';

let userID = 'e0240134-0986-4b92-a230-fdc8d1200456';
let proxyIP = '';

export default {
  async fetch(request, env) {
    userID = env.UUID || userID;
    proxyIP = env.PROXYIP || proxyIP;

    if (request.headers.get('Upgrade') === 'websocket') {
      return handleVless(request, userID, proxyIP);
    }

    const path = new URL(request.url).pathname.slice(1);
    if (path === userID) {
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
      const addonsLen = chunk[17];
      const cmdOffset = 18 + addonsLen;
      const port = (chunk[cmdOffset + 1] << 8) | chunk[cmdOffset + 2];
      const addrType = chunk[cmdOffset + 3];
      let addr = '';
      let addrEnd = cmdOffset + 4;

      if (addrType === 1) {
        addr = chunk.slice(addrEnd, addrEnd + 4).join('.');
        addrEnd += 4;
      } else if (addrType === 2) {
        const len = chunk[addrEnd];
        addr = new TextDecoder().decode(chunk.slice(addrEnd + 1, addrEnd + 1 + len));
        addrEnd += 1 + len;
      } else if (addrType === 3) {
        addr = Array.from(chunk.slice(addrEnd, addrEnd + 16))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('').match(/.{1,4}/g).join(':');
        addrEnd += 16;
      }

      server.send(new Uint8Array([chunk[0], 0]));

      try {
        tcpSocket = connect({ hostname: proxyIP || addr, port });
        const writer = tcpSocket.writable.getWriter();
        await writer.write(chunk.slice(addrEnd));
        writer.releaseLock();
        tcpSocket.readable.pipeTo(new WritableStream({
          write(d) {
            try { server.send(d); } catch {}
          }
        })).catch(() => { try { server.close(); } catch {} });
      } catch {
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
