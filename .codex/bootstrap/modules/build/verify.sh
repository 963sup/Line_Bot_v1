#!/usr/bin/env bash
verify_build() {
  check_version make '' make --version
  check_version gcc '' gcc --version
  check_version g++ '' g++ --version
  check_version pkg-config '' pkg-config --version
}
