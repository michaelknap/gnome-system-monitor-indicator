#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SCRIPT_DIR}/src"
OUT_DIR="${SCRIPT_DIR}/dist"
SCHEMA_FILE="schemas/org.gnome.shell.extensions.system-monitor-indicator.gschema.xml"

mkdir -p "${OUT_DIR}"

(
    cd "${SOURCE_DIR}"
    gnome-extensions pack . \
        --schema "${SCHEMA_FILE}" \
        --extra-source=../README.md \
        --extra-source=../LICENSE \
        --out-dir="${OUT_DIR}" \
        --force
)

printf 'Created extension bundle in %s\n' "${OUT_DIR}"
