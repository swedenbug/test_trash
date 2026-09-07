#!/usr/bin/env bash
# selftest.sh — проверка развёрнутого сервера.
#
#   ./selftest.sh progress.example.com ПРОПУСК
#
# Проверяет не только то, что работает разрешённое, но и то, что закрытое
# действительно закрыто. Второе важнее: незакрытая дверь молчит.

set -uo pipefail

HOST="${1:-}"
TOKEN="${2:-}"

if [ -z "$HOST" ]; then
  echo "Укажите имя: ./selftest.sh progress.example.com ПРОПУСК"
  exit 1
fi

pass=0
fail=0

check() {                       # описание, ожидаемое, полученное
  if [[ "$3" == *"$2"* ]]; then
    echo "  ок    $1"
    pass=$((pass + 1))
  else
    echo "  СБОЙ  $1"
    echo "        ожидалось: $2"
    echo "        получено:  ${3:0:120}"
    fail=$((fail + 1))
  fi
}

echo
echo "Службы"
for unit in postgresql progress-sync caddy; do
  state=$(systemctl is-active "$unit" 2>&1)
  check "$unit" "active" "$state"
done

echo
echo "Разрешённое"
check "сервер отвечает" '"ok":true' "$(curl -sS --max-time 10 "https://$HOST/health" 2>&1)"

if [ -n "$TOKEN" ]; then
  out=$(curl -sS --max-time 10 -H "Authorization: Bearer $TOKEN" \
    "https://$HOST/changes?since=1970-01-01T00:00:00.000Z" 2>&1)
  check "обмен с пропуском" '"changes"' "$out"
fi

echo
echo "Закрытое"
check "корень закрыт" "нет такой ручки" "$(curl -sS --max-time 10 "https://$HOST/" 2>&1)"
check "обмен без пропуска" "пропуск не принят" \
  "$(curl -sS --max-time 10 "https://$HOST/changes?since=1970-01-01T00:00:00.000Z" 2>&1)"
check "порт базы снаружи закрыт" "" \
  "$(timeout 5 bash -c "</dev/tcp/$HOST/5432" 2>&1 || echo 'соединение отклонено')"

echo
echo "Резервные копии"
last=$(tail -3 /var/log/progress-backup.log 2>/dev/null || echo "журнала нет")
echo "  последние строки журнала:"
echo "$last" | sed 's/^/    /'

echo
echo "Пройдено: $pass, сбоев: $fail"
[ "$fail" -eq 0 ]
