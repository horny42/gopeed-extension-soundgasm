#!/bin/bash
# Archive Gopeed downloads into a .zip after completion.
# Install: Gopeed -> Settings -> Advanced -> Developer -> Script Execution -> enable -> add full path to this file
#   chmod +x scripts/archive-soundgasm.sh
# Env provided by Gopeed: GOPEED_EVENT, GOPEED_TASK_ID, GOPEED_TASK_NAME, GOPEED_TASK_STATUS, GOPEED_TASK_PATH
set -u

log() { echo "[archive-soundgasm] $*"; }

if [ "${GOPEED_EVENT:-}" != "DOWNLOAD_DONE" ]; then
  log "skip: event=${GOPEED_EVENT:-unknown}"
  exit 0
fi

SRC="${GOPEED_TASK_PATH:-}"
if [ -z "$SRC" ]; then
  log "skip: GOPEED_TASK_PATH empty"
  exit 0
fi

# Only archive soundgasm tasks by default (task name or path contains user folder).
# Remove this filter if you want to archive ALL downloads.
case "$SRC ${GOPEED_TASK_NAME:-}" in
  *[Ss]oundgasm*|*/soundgasm/*) ;;
  *)
    # Profile tasks resolve to a folder named after the user; single tracks are files.
    # If you keep Gopeed's default download dir per task, archiving everything may be noisy,
    # so we still archive but tag it clearly. Comment out the next 3 lines to archive all silently.
    log "archiving non-soundgasm task too: $SRC"
    ;;
esac

if [ -d "$SRC" ]; then
  DEST="${SRC}.zip"
  log "zipping folder $SRC -> $DEST"
  # ditto preserves macOS resource forks; falls back to zip on Linux.
  if command -v ditto >/dev/null 2>&1; then
    ditto -c -k --sequesterRsrc "$SRC" "$DEST"
  else
    (cd "$(dirname "$SRC")" && zip -qr "$DEST" "$(basename "$SRC")")
  fi
  log "done: $DEST"
elif [ -f "$SRC" ]; then
  DEST="${SRC}.zip"
  log "zipping file $SRC -> $DEST"
  if command -v ditto >/dev/null 2>&1; then
    ditto -c -k --sequesterRsrc "$SRC" "$DEST"
  else
    (cd "$(dirname "$SRC")" && zip -qj "$DEST" "$(basename "$SRC")")
  fi
  log "done: $DEST"
else
  log "skip: path not found: $SRC"
  exit 0
fi
