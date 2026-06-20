#!/bin/sh
set -e

ARCH=$(uname -m)
echo "Architecture: $ARCH"

if [ ! -f /usr/local/bin/xray ] || ! /usr/local/bin/xray version 2>/dev/null; then
    echo "Downloading xray for $ARCH..."
    apk add --no-cache curl unzip 2>/dev/null || true
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
        URL="https://github.com/XTLS/Xray-core/releases/download/v1.8.24/Xray-linux-arm64-v8a.zip"
    else
        URL="https://github.com/XTLS/Xray-core/releases/download/v1.8.24/Xray-linux-64.zip"
    fi
    curl -fsSL "$URL" -o /tmp/xray.zip
    unzip -o /tmp/xray.zip xray -d /usr/local/bin/
    chmod +x /usr/local/bin/xray
    rm /tmp/xray.zip
fi

echo "xray version: $(/usr/local/bin/xray version | head -1)"
echo "Starting xray on port 8080..."
exec /usr/local/bin/xray run -config /etc/xray/config.json
