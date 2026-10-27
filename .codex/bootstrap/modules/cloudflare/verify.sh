#!/usr/bin/env bash
verify_cloudflare() { check_version cloudflare "$CLOUDFLARE_VERSION" "$BOOTSTRAP_PREFIX/bin/wrangler" --version; }
