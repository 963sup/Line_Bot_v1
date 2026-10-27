#!/usr/bin/env bash
verify_uv() {
  check_version uv "$UV_VERSION" uv --version
  check_version uvx "$UV_VERSION" uvx --version
}
