#!/usr/bin/env bash
verify_shellcheck() { check_version shellcheck '' "$BOOTSTRAP_PREFIX/bin/shellcheck" --version; }
