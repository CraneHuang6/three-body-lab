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
WIN_ZIP_NAME="electron-v31.7.7-win32-arm64.zip"
WIN_ZIP_SHA256="382de656e26620378f961f07b04fdc7e805de31399b7614826b86505abd7a4dd"

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
    "https://github.com/electron/electron/releases/download/v31.7.7/${WIN_ZIP_NAME}" \
    "${ELECTRON_WIN_DIR}/${WIN_ZIP_NAME}" \
    "$WIN_ZIP_SHA256"
}

verify_frontend() {
  print_step "run tests and frontend build"
  (
    cd "$TMP_BUILD_DIR"
    npm test
    npm run build
  )
}

package_mac_zip() {
  print_step "build macOS zip"
  (
    cd "$TMP_BUILD_DIR"
    CSC_IDENTITY_AUTO_DISCOVERY=false \
      ./node_modules/.bin/electron-builder \
      --mac zip \
      -c.electronDist="$ELECTRON_MAC_DIR" \
      -c.directories.output=release-mac-zip \
      --publish=never
  )
}

package_mac_dmg() {
  print_step "build macOS dmg"
  (
    cd "$TMP_BUILD_DIR"
    CSC_IDENTITY_AUTO_DISCOVERY=false \
      ./node_modules/.bin/electron-builder \
      --mac dmg \
      -c.electronDist="$ELECTRON_MAC_DIR" \
      -c.directories.output=release-mac-dmg \
      --publish=never
  )
}

package_win_portable() {
  print_step "build Windows portable"
  (
    cd "$TMP_BUILD_DIR"
    ./node_modules/.bin/electron-builder \
      --win portable \
      -c.electronDist="$ELECTRON_WIN_DIR" \
      -c.directories.output=release-win-portable \
      --publish=never
  )
}

package_win_nsis() {
  print_step "build Windows NSIS"
  (
    cd "$TMP_BUILD_DIR"
    ./node_modules/.bin/electron-builder \
      --win nsis \
      -c.electronDist="$ELECTRON_WIN_DIR" \
      -c.directories.output=release-win-nsis \
      --publish=never
  )
}

collect_artifacts() {
  print_step "collect artifacts into repo release directory"
  rm -rf "$RELEASE_OUT_DIR"
  mkdir -p "$RELEASE_OUT_DIR"

  cp -R "$TMP_BUILD_DIR/release-mac-zip" "$RELEASE_OUT_DIR/mac-zip"
  cp -R "$TMP_BUILD_DIR/release-mac-dmg" "$RELEASE_OUT_DIR/mac-dmg"
  cp -R "$TMP_BUILD_DIR/release-win-portable" "$RELEASE_OUT_DIR/win-portable"
  cp -R "$TMP_BUILD_DIR/release-win-nsis" "$RELEASE_OUT_DIR/win-nsis"
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
  package_mac_zip
  package_mac_dmg
  package_win_portable
  package_win_nsis
  collect_artifacts

  print_step "done"
  find "$RELEASE_OUT_DIR" -maxdepth 2 -type f | sort
}

main "$@"
