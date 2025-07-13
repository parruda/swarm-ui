#!/bin/bash
# Create nginx temp directories
mkdir -p /tmp/nginx_client_temp /tmp/nginx_proxy_temp /tmp/nginx_fastcgi_temp /tmp/nginx_uwsgi_temp /tmp/nginx_scgi_temp

# Start nginx in foreground
exec nginx -g "daemon off;" -c /etc/nginx/nginx.conf