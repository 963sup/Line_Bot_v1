#!/bin/sh
# BusyBox wget ignores NO_PROXY. Only health probes to loopback bypass the proxy.
for argument do
  case "$argument" in
    http://127.0.0.1:*|http://localhost:*|http://\[::1\]:*) exec /usr/bin/wget -Y off "$@" ;;
  esac
done
exec /usr/bin/wget "$@"
