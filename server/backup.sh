#!/usr/bin/env bash
# backup.sh — слепок базы с проверкой восстановления.
#
# Копия, которую ни разу не пробовали восстановить, копией не является,
# поэтому скрипт не просто снимает слепок, а разворачивает его во временную
# базу и считает строки. Если разворот не удался — слепок не засчитывается.
#
# Расписание:  0 4 * * *  /opt/progress/server/backup.sh >> /var/log/progress-backup.log 2>&1
#
# Проверить вручную (перенаправление выполняет оболочка вызывающего, поэтому
# нужна именно такая обёртка, иначе упрётся в права на файл журнала):
#   sudo -u postgres bash -c '/opt/progress/server/backup.sh >> /var/log/progress-backup.log 2>&1'

set -euo pipefail

# Уходим в заведомо доступную папку. Запуск из чужой домашней папки роняет
# последнюю команду: find не может вернуться в исходную папку, слепок при этом
# уже снят и проверен, а очистка старых копий молча не выполняется.
cd /tmp

DB="${DB:-progress}"
DIR="${DIR:-/var/backups/progress}"
KEEP_DAYS="${KEEP_DAYS:-30}"
STAMP="$(date +%Y-%m-%d_%H%M)"
FILE="$DIR/$DB-$STAMP.sql.gz"
PROBE="progress_restore_probe"

if [ ! -d "$DIR" ]; then
  mkdir -p "$DIR" 2>/dev/null || {
    echo "[$(date -Is)] ОШИБКА: нет папки $DIR и её не создать."
    echo "  sudo mkdir -p $DIR && sudo chown $(id -un):$(id -gn) $DIR"
    exit 1
  }
fi

if [ ! -w "$DIR" ]; then
  echo "[$(date -Is)] ОШИБКА: в $DIR нельзя писать от имени $(id -un)."
  echo "  sudo chown $(id -un):$(id -gn) $DIR"
  exit 1
fi

echo "[$(date -Is)] снимаю слепок $FILE"
pg_dump --no-owner --no-acl "$DB" | gzip -9 > "$FILE"

echo "[$(date -Is)] проверяю восстановление"
# Первый запуск: временной базы ещё нет. Это не ошибка, поэтому молча.
dropdb --if-exists "$PROBE" >/dev/null 2>&1 || true
createdb "$PROBE"
gunzip -c "$FILE" | psql -q -d "$PROBE" >/dev/null

ROWS=$(psql -tA -d "$PROBE" -c "select count(*) from water_intake")
dropdb "$PROBE"

if ! [ "$ROWS" -ge 0 ] 2>/dev/null; then
  echo "[$(date -Is)] ОШИБКА: слепок не разворачивается, удаляю его"
  rm -f "$FILE"
  exit 1
fi

echo "[$(date -Is)] проверено, записей о воде: $ROWS"

find "$DIR" -name "$DB-*.sql.gz" -mtime "+$KEEP_DAYS" -delete
echo "[$(date -Is)] готово, старше $KEEP_DAYS дней удалено"

# Слепок лежит на том же диске, что и база: это спасает от ошибки, но не от
# потери диска. Увоз копии за пределы сервера настраивается отдельно, например:
#   rclone copy "$FILE" удалённое:progress-backups
