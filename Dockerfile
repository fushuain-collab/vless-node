FROM alpine:3.19

RUN apk add --no-cache curl unzip ca-certificates

# 下载 xray arm64
RUN curl -fsSL https://github.com/XTLS/Xray-core/releases/download/v1.8.24/Xray-linux-arm64-v8a.zip -o /tmp/xray.zip \
    && unzip /tmp/xray.zip xray -d /usr/local/bin/ \
    && chmod +x /usr/local/bin/xray \
    && rm /tmp/xray.zip

# 备用 amd64（Render 实际是 x86_64）
RUN if ! /usr/local/bin/xray version 2>/dev/null; then \
    curl -fsSL https://github.com/XTLS/Xray-core/releases/download/v1.8.24/Xray-linux-64.zip -o /tmp/xray.zip \
    && unzip -o /tmp/xray.zip xray -d /usr/local/bin/ \
    && chmod +x /usr/local/bin/xray \
    && rm /tmp/xray.zip; fi

COPY config.json /etc/xray/config.json
COPY start.sh /start.sh
RUN chmod +x /start.sh

EXPOSE 8080

CMD ["/start.sh"]
