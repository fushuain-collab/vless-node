const SOURCE_URL =
  "https://raw.githubusercontent.com/fushuain-collab/vless-node/main/bettbox-national20-ruleset-final.yaml";

const CF_ENTRY = "cloudflare-ip.mofashi.ltd";
const SUB_PATHS = new Set([
  "/",
  "/sub/bettbox",
  "/sub/bettbox.yaml",
  "/sub/mihomo",
  "/sub/clash",
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (SUB_PATHS.has(url.pathname)) {
      return handleSubscription(request, env, ctx);
    }

    if (url.pathname === "/health") {
      return new Response("ok", {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    return new Response(
      [
        "MOFASHI Bettbox Cloudflare subscription is running.",
        "",
        "Subscription:",
        `${url.origin}/sub/bettbox`,
      ].join("\n"),
      {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  },
};

async function handleSubscription(request, env, ctx) {
  try {
    const upstream = await fetch(SOURCE_URL, {
      headers: {
        "User-Agent": "MOFASHI-Bettbox-CF-Sub/1.0",
        Accept: "text/plain,text/yaml,application/yaml,*/*",
      },
      cf: {
        cacheTtl: 300,
        cacheEverything: true,
      },
    });

    if (!upstream.ok) {
      return new Response(`Failed to fetch source subscription: ${upstream.status}`, {
        status: 502,
        headers: responseHeaders("no-store"),
      });
    }

    const sourceYaml = await upstream.text();
    const yaml = transformToMofashiCloudflare(sourceYaml);

    return new Response(yaml, {
      status: 200,
      headers: responseHeaders("no-store"),
    });
  } catch (error) {
    return new Response(`Subscription worker error: ${error && error.message ? error.message : error}`, {
      status: 500,
      headers: responseHeaders("no-store"),
    });
  }
}

function responseHeaders(cacheControl) {
  return {
    "Content-Type": "text/yaml; charset=utf-8",
    "Cache-Control": cacheControl,
    "Profile-Update-Interval": "6",
    "Subscription-Userinfo":
      "upload=0; download=0; total=107374182400; expire=1893427200",
    "Access-Control-Allow-Origin": "*",
  };
}

function transformToMofashiCloudflare(yaml) {
  let output = yaml;

  output = output.replace(
    /^(\s*server:\s*)172\.64\.\d{1,3}\.\d{1,3}\s*$/gm,
    `$1${CF_ENTRY}`
  );

  output = output.replace(
    /(\b(?:HK|TW|US|JP|KR|SG|MY|IN|VN)-\d{2}-172\.64\.\d{1,3}\.\d{1,3}:\d+-(?:STABLE|OK|AUTO)\b)/g,
    "🌩️MOFASHI-CF-$1"
  );

  output = output.replace(/🌩️MOFASHI-CF-🌩️MOFASHI-CF-/g, "🌩️MOFASHI-CF-");

  const header = [
    "# Bettbox / Mihomo subscription - MOFASHI Cloudflare optimized edition",
    "# New subscription, original project unchanged.",
    `# Source: ${SOURCE_URL}`,
    `# Transform: server => ${CF_ENTRY}`,
    "# Keep: port / UUID / SNI / Host / path / rules / proxy-groups",
    "# Client: Bettbox / Mihomo / Clash Meta",
    "",
  ].join("\n");

  return header + output;
}
