#!/usr/bin/env bash
set -euo pipefail

SOURCE_FILE="${SOURCE_FILE:-/lzcsys/data/home/timlihk/Code/gym-sync/state.json}"
BACKUP_DIR="${BACKUP_DIR:-/lzcsys/data/home/timlihk/backup/gym-sync}"
RETENTION_DAYS="${RETENTION_DAYS:-45}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTFILE="${BACKUP_DIR}/state_${TIMESTAMP}.json"
LATEST="${BACKUP_DIR}/state_latest.json"

mkdir -p "${BACKUP_DIR}"
test -s "${SOURCE_FILE}"

cp "${SOURCE_FILE}" "${OUTFILE}.tmp"
python3 -m json.tool "${OUTFILE}.tmp" >/dev/null
mv "${OUTFILE}.tmp" "${OUTFILE}"
ln -sfn "$(basename "${OUTFILE}")" "${LATEST}"

find "${BACKUP_DIR}" -type f -name "state_*.json" -mtime +"${RETENTION_DAYS}" -delete

printf "Created %s\n" "${OUTFILE}"
