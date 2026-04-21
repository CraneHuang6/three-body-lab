#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_BUILD_DIR="${TMP_BUILD_DIR:-/tmp/threebody-build}"
NPM_CACHE_DIR="${NPM_CACHE_DIR:-/tmp/threebody-npm-cache}"
ELECTRON_MAC_DIR="${ELECTRON_MAC_DIR:-/tmp/electron-dist-mac}"
ELECTRON_WIN_DIR="${ELECTRON_WIN_DIR:-/tmp/electron-dist-win}"
RELEASE_OUT_DIR="${RELEASE_OUT_DIR:-$ROOT_DIR/release}"

MAC_ZIP_NAME="electron-v31.7.7-darwin-arm64.zip"
MAC_ZIP_SHA256="e81b75a185376effcc7dd15aef8877ab48474633e5ac7417810a3b28e694bbfa"
WIN_X64_ZIP_NAME="electron-v31.7.7-win32-x64.zip"
WIN_X64_ZIP_SHA256="e91986dd243d55947e6c5d3fad21795562ec21fa0eec5e95f7e28c830571467f"
WIN_ARM64_ZIP_NAME="electron-v31.7.7-win32-arm64.zip"
WIN_ARM64_ZIP_SHA256="382de656e26620378f961f07b04fdc7e805de31399b7614826b86505abd7a4dd"

print_step() {
  printf '\n==> %s\n' "$1"
}

download_with_resume() {
  local url="$1"
  local target="$2"
  local expected_sha="$3"
  local attempt
  mkdir -p "$(dirname "$target")"

  for attempt in 1 2 3 4 5 6 7 8; do
    if [[ -f "$target" ]]; then
      local current_sha
      current_sha="$(shasum -a 256 "$target" | awk '{print $1}')"
      if [[ "$current_sha" == "$expected_sha" ]]; then
        printf 'download ok: %s\n' "$target"
        return 0
      fi
    fi

    printf 'download attempt %s: %s\n' "$attempt" "$url"
    curl -L --fail -C - -o "$target" "$url" || true
    sleep 2
  done

  local final_sha
  final_sha="$(shasum -a 256 "$target" | awk '{print $1}')"
  if [[ "$final_sha" != "$expected_sha" ]]; then
    printf 'checksum mismatch for %s\nexpected: %s\nactual:   %s\n' "$target" "$expected_sha" "$final_sha" >&2
    return 1
  fi
}

prepare_workspace() {
  print_step "sync repo into temp build workspace"
  rm -rf "$TMP_BUILD_DIR"
  mkdir -p "$TMP_BUILD_DIR"
  rsync -a --delete \
    --exclude .git \
    --exclude node_modules \
    --exclude .npm-cache \
    --exclude release \
    --exclude dist \
    "$ROOT_DIR/" "$TMP_BUILD_DIR/"
}

install_dependencies() {
  print_step "install dependencies without Electron postinstall download"
  (
    cd "$TMP_BUILD_DIR"
    ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --cache "$NPM_CACHE_DIR" --legacy-peer-deps
  )
}

download_electron_dist() {
  print_step "download Electron runtime archives"
  download_with_resume \
    "https://github.com/electron/electron/releases/download/v31.7.7/${MAC_ZIP_NAME}" \
    "${ELECTRON_MAC_DIR}/${MAC_ZIP_NAME}" \
    "$MAC_ZIP_SHA256"
  download_with_resume \
    "https://github.com/electron/electron/releases/download/v31.7.7/${WIN_X64_ZIP_NAME}" \
    "${ELECTRON_WIN_DIR}/${WIN_X64_ZIP_NAME}" \
    "$WIN_X64_ZIP_SHA256"
  download_with_resume \
    "https://github.com/electron/electron/releases/download/v31.7.7/${WIN_ARM64_ZIP_NAME}" \
    "${ELECTRON_WIN_DIR}/${WIN_ARM64_ZIP_NAME}" \
    "$WIN_ARM64_ZIP_SHA256"
}

verify_frontend() {
  print_step "run tests and frontend build"
  (
    cd "$TMP_BUILD_DIR"
    npm test
    npm run build
  )
}

package_mac_free_zip() {
  print_step "build macOS zip for free distribution"
  (
    cd "$TMP_BUILD_DIR"
    THREEBODY_PROJECT_DIR="$TMP_BUILD_DIR" \
    THREEBODY_RELEASE_DIR="$TMP_BUILD_DIR/release-mac-zip" \
    THREEBODY_ELECTRON_DIST_DIR="$ELECTRON_MAC_DIR" \
    THREEBODY_MAC_ARCH=arm64 \
      node scripts/package-mac-free.mjs
  )
}

package_win_portable_x64() {
  print_step "build Windows portable (x64)"
  (
    cd "$TMP_BUILD_DIR"
    ./node_modules/.bin/electron-builder \
      --win portable \
      --x64 \
      -c.electronDist="$ELECTRON_WIN_DIR" \
      -c.directories.output=release-win-portable/x64 \
      --publish=never
  )
}

package_win_portable_arm64() {
  print_step "build Windows portable (arm64)"
  (
    cd "$TMP_BUILD_DIR"
    ./node_modules/.bin/electron-builder \
      --win portable \
      --arm64 \
      -c.electronDist="$ELECTRON_WIN_DIR" \
      -c.directories.output=release-win-portable/arm64 \
      --publish=never
  )
}

collect_artifacts() {
  print_step "collect artifacts into repo release directory"
  rm -rf "$RELEASE_OUT_DIR"
  mkdir -p "$RELEASE_OUT_DIR"

  cp -R "$TMP_BUILD_DIR/release-mac-zip" "$RELEASE_OUT_DIR/mac-zip"
  cp -R "$TMP_BUILD_DIR/release-win-portable" "$RELEASE_OUT_DIR/win-portable"
}

main() {
  print_step "packaging release artifacts"
  printf 'repo root: %s\n' "$ROOT_DIR"
  printf 'tmp build: %s\n' "$TMP_BUILD_DIR"
  printf 'release out: %s\n' "$RELEASE_OUT_DIR"

  prepare_workspace
  install_dependencies
  download_electron_dist
  verify_frontend
  package_mac_free_zip
  package_win_portable_x64
  package_win_portable_arm64
  collect_artifacts

  print_step "done"
  find "$RELEASE_OUT_DIR" -maxdepth 3 -type f | sort
}

main "$@"
