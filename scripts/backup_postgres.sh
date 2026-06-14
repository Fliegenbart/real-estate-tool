#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env}"
BACKUP_DIR="${BACKUP_DIR:-./backups/postgres}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Compose file not found: $COMPOSE_FILE" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  echo "On Hetzner run from /opt/immo-tool or set ENV_FILE=/opt/immo-tool/.env" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

POSTGRES_DB="${POSTGRES_DB:-realestate}"
POSTGRES_USER="${POSTGRES_USER:-realestate}"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

timestamp="$(date -u +"%Y%m%dT%H%M%SZ")"
backup_file="$BACKUP_DIR/${POSTGRES_DB}_${timestamp}.dump"
tmp_file="${backup_file}.tmp"

container_id="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q db)"
if [[ -z "$container_id" ]]; then
  echo "Database container is not running. Start the production stack first." >&2
  exit 1
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl > "$tmp_file"

mv "$tmp_file" "$backup_file"
ln -sfn "$(basename "$backup_file")" "$BACKUP_DIR/latest.dump"

find "$BACKUP_DIR" -type f -name "${POSTGRES_DB}_*.dump" -mtime "+$RETENTION_DAYS" -delete

echo "Backup written: $backup_file"
echo "Restore example:"
echo "  docker compose --env-file $ENV_FILE -f $COMPOSE_FILE exec -T db pg_restore -U $POSTGRES_USER -d $POSTGRES_DB --clean --if-exists < $backup_file"
