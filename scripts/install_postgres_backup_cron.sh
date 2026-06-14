#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/immo-tool}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
CRON_FILE="${CRON_FILE:-/etc/cron.d/immo-postgres-backup}"
LOG_FILE="${LOG_FILE:-/var/log/immo-postgres-backup.log}"
SCHEDULE="${SCHEDULE:-17 3 * * *}"
RUN_AS_USER="${RUN_AS_USER:-root}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Please run as root on the Hetzner server." >&2
  exit 1
fi

if [[ ! -x "$APP_DIR/scripts/backup_postgres.sh" ]]; then
  echo "Backup script not found or not executable: $APP_DIR/scripts/backup_postgres.sh" >&2
  exit 1
fi

cat > "$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

$SCHEDULE $RUN_AS_USER cd $APP_DIR && BACKUP_DIR=$BACKUP_DIR RETENTION_DAYS=$RETENTION_DAYS ./scripts/backup_postgres.sh >> $LOG_FILE 2>&1
EOF

chmod 0644 "$CRON_FILE"
touch "$LOG_FILE"
chmod 0640 "$LOG_FILE"

echo "Installed daily Postgres backup cron: $CRON_FILE"
echo "Schedule: $SCHEDULE"
echo "Log: $LOG_FILE"
