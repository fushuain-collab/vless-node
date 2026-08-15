#!/usr/bin/env python3
from __future__ import annotations

import copy
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
base = yaml.safe_load((ROOT / 'yuhe-bettbox-vless.yaml').read_text(encoding='utf-8-sig'))

UUID = '4f05f0b9-f75d-4cc3-8d2f-4f7ab7f65e0a'
HOST = 'w.yuhe.kdns.fr'
PATH = '/vless'

candidates = [
    ('STABLE-172-443', '172.64.148.42', 443),
    ('STABLE-172-2053', '172.64.148.42', 2053),
    ('STABLE-172-2087', '172.64.148.42', 2087),
    ('ALT-17266-443-01', '172.66.0.1', 443),
    ('ALT-17266-443-02', '172.66.0.2', 443),
    ('ALT-17266-2053', '172.66.3.63', 2053),
    ('ALT-17266-2083', '172.66.3.74', 2083),
    ('ALT-17266-2087', '172.66.3.56', 2087),
    ('ALT-17266-2096', '172.66.3.76', 2096),
    ('ALT-10417-2083', '104.17.181.145', 2083),
    ('ALT-10417-443', '104.17.22.30', 443),
    ('ALT-19841-2087', '198.41.208.94', 2087),
]

def proxy(name, server, port):
    return {
        'name': name,
        'type': 'vless',
        'server': server,
        'port': port,
        'uuid': UUID,
        'network': 'ws',
        'tls': True,
        'udp': True,
        'servername': HOST,
        'client-fingerprint': 'chrome',
        'ws-opts': {'path': PATH, 'headers': {'Host': HOST}},
    }

names = [n for n, _, _ in candidates]
base['proxies'] = [proxy(*row) for row in candidates]
base['proxy-groups'] = [
    {'name': 'PROXY', 'type': 'select', 'proxies': ['AUTO', 'FALLBACK'] + names + ['DIRECT']},
    {'name': 'AUTO', 'type': 'url-test', 'proxies': names, 'url': 'http://www.gstatic.com/generate_204', 'interval': 180, 'tolerance': 80, 'lazy': False},
    {'name': 'FALLBACK', 'type': 'fallback', 'proxies': names, 'url': 'http://www.gstatic.com/generate_204', 'interval': 180, 'lazy': False},
]

base['dns'] = {
    'enable': True,
    'listen': '0.0.0.0:1053',
    'ipv6': False,
    'enhanced-mode': 'fake-ip',
    'fake-ip-range': '198.18.0.1/16',
    'respect-rules': True,
    'use-hosts': False,
    'use-system-hosts': False,
    'fake-ip-filter': [
        '*.lan', '*.local', '*.localhost', '*.localdomain',
        '+.msftconnecttest.com', '+.msftncsi.com',
        '+.qq.com', '+.tencent.com', '+.wechat.com', '+.weixin.qq.com',
        '+.jd.com', '+.360buyimg.com', '+.jdimg.com', '+.taobao.com', '+.tmall.com', '+.alicdn.com',
        '+.mi.com', '+.bilibili.com',
        '+.cloudflare.com', '+.cloudflare.net', '+.cloudflareaccess.com', '+.cloudflareclient.com', '+.workers.dev',
        HOST,
    ],
    'default-nameserver': ['223.5.5.5', '119.29.29.29'],
    'proxy-server-nameserver': ['223.5.5.5', '119.29.29.29'],
    'direct-nameserver': ['223.5.5.5', '119.29.29.29'],
    'nameserver': ['223.5.5.5', '119.29.29.29'],
    'fallback': ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query', 'tls://1.1.1.1:853'],
    'fallback-filter': {
        'geoip': True,
        'geoip-code': 'CN',
        'geosite': ['gfw'],
        'ipcidr': ['240.0.0.0/4', '0.0.0.0/32'],
        'domain': ['+.google.com', '+.github.com', '+.youtube.com', '+.telegram.org', '+.openai.com', '+.chatgpt.com', '+.anthropic.com', '+.claude.ai'],
    },
    'nameserver-policy': {
        'geosite:cn': ['223.5.5.5', '119.29.29.29'],
        'geosite:geolocation-!cn': ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query'],
        'domain:raw.githubusercontent.com': ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query'],
        'domain:github.com': ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query'],
        'domain:githubusercontent.com': ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query'],
    },
}

# Put explicit direct rules before remote providers so domestic app assets do not get proxied by broad lists.
rules = base.get('rules') or []
prefix = [
    'RULE-SET,private,DIRECT',
    'GEOIP,LAN,DIRECT,no-resolve',
    'DOMAIN-SUFFIX,agnes-ai.com,DIRECT',
    'DOMAIN,apihub.agnes-ai.com,DIRECT',
    'DOMAIN-SUFFIX,jd.com,DIRECT',
    'DOMAIN-SUFFIX,jd.hk,DIRECT',
    'DOMAIN-SUFFIX,360buyimg.com,DIRECT',
    'DOMAIN-SUFFIX,jdimg.com,DIRECT',
    'DOMAIN-SUFFIX,jcloud.com,DIRECT',
    'DOMAIN-SUFFIX,3.cn,DIRECT',
    'DOMAIN-SUFFIX,alicdn.com,DIRECT',
    'DOMAIN-SUFFIX,taobao.com,DIRECT',
    'DOMAIN-SUFFIX,tmall.com,DIRECT',
    'DOMAIN-SUFFIX,alipay.com,DIRECT',
    'DOMAIN-SUFFIX,gtimg.com,DIRECT',
    'DOMAIN-SUFFIX,byteimg.com,DIRECT',
    'DOMAIN-SUFFIX,qq.com,DIRECT',
    'DOMAIN-SUFFIX,tencent.com,DIRECT',
    'DOMAIN-SUFFIX,wechat.com,DIRECT',
    'DOMAIN-SUFFIX,weixin.qq.com,DIRECT',
    'DOMAIN-SUFFIX,cloudflare.com,DIRECT',
    'DOMAIN-SUFFIX,cloudflare.net,DIRECT',
]
seen = set()
merged = []
for r in prefix + rules:
    if r not in seen:
        seen.add(r); merged.append(r)
base['rules'] = merged

out = ROOT / 'yuhe-bettbox-vless-dns-cleanip-test.yaml'
text = yaml.safe_dump(base, allow_unicode=True, sort_keys=False, width=120)
out.write_text('# YUHE Bettbox / Mihomo - DNS clean-IP test with diversified Cloudflare entry pool\n' + text, encoding='utf-8')
print(out)
