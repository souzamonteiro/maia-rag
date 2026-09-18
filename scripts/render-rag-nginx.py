#!/usr/bin/env python3
"""Render deployment files without modifying Nginx or contacting any host."""
import argparse
import ipaddress
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--rag-ip', required=True, type=ipaddress.IPv4Address)
parser.add_argument('--vps-ip', required=True, type=ipaddress.IPv4Address)
parser.add_argument('--output', required=True, type=Path)
args = parser.parse_args()
for address in (args.rag_ip, args.vps_ip):
    if not address.is_private or address.is_unspecified or address.is_loopback or address.is_multicast:
        parser.error('Use private unicast WireGuard IPv4 addresses.')
if args.rag_ip == args.vps_ip:
    parser.error('The VPS and RAG must have different addresses.')
source = Path(__file__).resolve().parent.parent / 'deploy/nginx'
args.output.mkdir(parents=True, exist_ok=True)
for name in ('rag-client', 'rag-vps'):
    content = (source / f'{name}.conf.template').read_text()
    content = content.replace('__RAG_WG_IP__', str(args.rag_ip)).replace('__VPS_WG_IP__', str(args.vps_ip))
    target = args.output / f'{name}.conf'
    target.write_text(content)
    print(target)
