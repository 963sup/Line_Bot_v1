#!/usr/bin/env bash
verify_shfmt() { check_version shfmt "$SHFMT_VERSION" "$BOOTSTRAP_PREFIX/bin/shfmt" --version; }
