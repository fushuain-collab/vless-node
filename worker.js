// vless worker - no nodejs_compat needed
export default {
  async fetch(request, env) {
    const uuid = env.UUID || 'e0240134-0986-4b92-a230-fdc8d1200456';
    const upgrade = request.headers.get('Upgrade');
    if (upgrade === 'websocket') {
      return handleVless(request, uuid, env.PROXYIP || '');
    }
    const url = new URL(request.url);
    if (url.pathname.slice(1) === uuid) {
      const host = request.headers.get('Host');
      return new Response(
        `vless://${uuid}@${host}:443?security=tls&type=ws&path=%2Fvless&host=${host}&sni=${host}&encryption=none#Worker-${host}`,
        { headers: { 'Content-Type': 'text/plain' } }
      );
    }
    return new Response('ok');
  }
};

async function handleVless(request, uuid, proxyIP) {
  const [client, server] = Object.values(new WebSocketPair());
  server.accept();
  let tcpSocket = null;

  server.addEventListener('message', async ({ data }) => {
    const buf = data instanceof ArrayBuffer ? data : data.buffer;
    const bytes = new Uint8Array(buf);
    if (!tcpSocket) {
      // parse vless header
      const addonsLen = bytes[17];
      const cmdOffset = 18 + addonsLen;
      const port = (bytes[cmdOffset + 1] << 8) | bytes[cmdOffset + 2];
      const addrType = bytes[cmdOffset + 3];
      let addr = '', addrEnd;
      if (addrType === 1) {
        addr = bytes.slice(cmdOffset+4, cmdOffset+8).join('.');
        addrEnd = cmdOffset + 8;
      } else if (addrType === 2) {
        const len = bytes[cmdOffset + 4];
        addr = new TextDecoder().decode(bytes.slice(cmdOffset+5, cmdOffset+5+len));
        addrEnd = cmdOffset + 5 + len;
      } else {
        addr = proxyIP || '1.1.1.1';
        addrEnd = cmdOffset + 20;
      }
      server.send(new Uint8Array([bytes[0], 0]));
      const target = proxyIP || addr;
      try {
        const { connect } = await import('cloudflare:sockets');
        tcpSocket = connect({ hostname: target, port });
        const writer = tcpSocket.writable.getWriter();
        await writer.write(bytes.slice(addrEnd));
        writer.releaseLock();
        tcpSocket.readable.pipeTo(new WritableStream({
          write(chunk) { if (server.readyState === 1) server.send(chunk); }
        })).catch(() => server.close());
      } catch(e) { server.close(); }
    } else {
      const writer = tcpSocket.writable.getWriter();
      await writer.write(bytes);
      writer.releaseLock();
    }
  });

  server.addEventListener('close', () => { if (tcpSocket) tcpSocket.close(); });
  return new Response(null, { status: 101, webSocket: client });
}
