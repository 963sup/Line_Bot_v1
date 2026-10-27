#!/usr/bin/env bash
verify_actionlint() { check_version actionlint "$ACTIONLINT_VERSION" "$BOOTSTRAP_PREFIX/bin/actionlint" -version; }
