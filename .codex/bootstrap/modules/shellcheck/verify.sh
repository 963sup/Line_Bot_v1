#!/usr/bin/env bash
verify_shellcheck() { check_version shellcheck "$SHELLCHECK_VERSION" "$BOOTSTRAP_PREFIX/bin/shellcheck" --version; }
