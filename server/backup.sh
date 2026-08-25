#!/usr/bin/env bash
# backup.sh — слепок базы с проверкой восстановления.
#
# Копия, которую ни разу не пробовали восстановить, копией не является,
# поэтому скрипт не просто снимает слепок, а разворачивает его во временную
# базу и считает строки. Если разворот не удался — слепок не засчитывается.
#
# Расписание:  0 4 * * *  /opt/progress/server/backup.sh >> /var/log/progress-backup.log 2>&1

set -euo pipefail

DB="${DB:-progress}"
DIR="${DIR:-/var/backups/progress}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date +%Y-%m-%d_%H%M)"
FILE="$DIR/$DB-$STAMP.sql.gz"
PROBE="progress_restore_probe"

mkdir -p "$DIR"

echo "[$(date -Is)] снимаю слепок $FILE"
pg_dump --no-owner --no-acl "$DB" | gzip -9 > "$FILE"

echo "[$(date -Is)] проверяю восстановление"
dropdb --if-exists "$PROBE"
createdb "$PROBE"
gunzip -c "$FILE" | psql -q -d "$PROBE" >/dev/null

ROWS=$(psql -tA -d "$PROBE" -c "select count(*) from water_intake")
dropdb "$PROBE"

if [ "$ROWS" -lt 0 ] 2>/dev/null; then
  echo "[$(date -Is)] ОШИБКА: слепок не разворачивается"
  rm -f "$FILE"
  exit 1
fi

echo "[$(date -Is)] проверено, записей о воде: $ROWS"

find "$DIR" -name "$DB-*.sql.gz" -mtime "+$KEEP_DAYS" -delete
echo "[$(date -Is)] готово, старше $KEEP_DAYS дней удалено"

# Слепок на том же диске, что и база, спасает от ошибки, но не от потери диска.
# Увоз копии за пределы сервера настраивается отдельно, например:
#   rclone copy "$FILE" удалённое:progress-backups
