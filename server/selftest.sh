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
echo "Движок тем"
if [ -z "$TOKEN" ]; then
  echo "  пропущено: без пропуска обмен не проверить"
else
  T=00000000-0000-4000-8000-0000000000a1   # тема
  BAD_T=00000000-0000-4000-8000-0000000000a2
  G=00000000-0000-4000-8000-0000000000ff   # темы с таким id нет и не будет
  NOW=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
  DAY=$(date -u +%F)

  push() {                      # тело -> ответ
    curl -sS --max-time 10 -X POST \
      -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
      --data "$1" "https://$HOST/changes" 2>&1
  }
  pull() {
    curl -sS --max-time 10 -H "Authorization: Bearer $TOKEN" \
      "https://$HOST/changes?since=1970-01-01T00:00:00.000Z" 2>&1
  }
  entry() {                     # id, theme_id, source, хвост -> объект записи
    printf '{"id":"%s","theme_id":"%s","at":"%s","local_date":"%s","value":250,' \
      "$1" "$2" "$NOW" "$DAY"
    printf '"source":"%s","note":null,"created_at":"%s","updated_at":"%s","deleted_at":null%s}' \
      "$3" "$NOW" "$NOW" "${4:-}"
  }
  theme_row() {                 # id, quick как есть -> объект темы
    printf '{"id":"%s","name":"Проверка","short":null,"description":null,"parent_id":null,' "$1"
    printf '"kind":"count","unit":null,"direction":"at_least","goal_period":"day",'
    printf '"urgency_kind":"none","soft_after":null,"hard_after":null,"quick":%s,' "$2"
    printf '"color":"#58b6ee","emblem":"silhouette:drop","fill":"percent","sort":0,"active":true,'
    printf '"created_at":"%s","updated_at":"%s","deleted_at":null}' "$NOW" "$NOW"
  }

  # Структура: новые ключи появились, старые не пропали.
  out=$(pull)
  for key in theme theme_goal entry water_intake water_goal; do
    check "обмен отдаёт $key" "\"$key\"" "$out"
  done

  # 4. Тема и запись принимаются, следующий GET их возвращает.
  out=$(push "{\"changes\":{\"theme\":[$(theme_row "$T" '[250,1000]')],\"entry\":[$(entry 00000000-0000-4000-8000-0000000000b1 "$T" tap)]}}")
  check "тема и запись приняты" '"accepted"' "$out"
  out=$(pull)
  check "тема вернулась обратно"   "$T" "$out"
  check "запись вернулась обратно" "0000000000b1" "$out"

  # 5. Главная проверка захода: внешнего ключа нет, сирота принимается.
  out=$(push "{\"changes\":{\"entry\":[$(entry 00000000-0000-4000-8000-0000000000b2 "$G" tap)]}}")
  check "запись без своей темы принята" '"accepted"' "$out"

  # 6. Значение source, которое сегодня не пишет ни один модуль.
  out=$(push "{\"changes\":{\"entry\":[$(entry 00000000-0000-4000-8000-0000000000b3 "$T" timer)]}}")
  check "source=timer принят" '"accepted"' "$out"

  # 7. Негодный source. Поштучного отбрасывания на сервере нет: пачка
  #    обёрнута в одну транзакцию и отвергается целиком. Проверяем то, что
  #    есть, а не то, что записано в журнале решений от 25 августа.
  out=$(push "{\"changes\":{\"entry\":[$(entry 00000000-0000-4000-8000-0000000000b4 "$T" foo),$(entry 00000000-0000-4000-8000-0000000000b5 "$T" manual)]}}")
  check "source=foo отвергает пачку" 'пачка не принята' "$out"
  out=$(pull)
  if [[ "$out" == *0000000000b5* ]]; then
    check "годная запись из отвергнутой пачки не сохранена" "её нет в выдаче" "она есть"
  else
    check "годная запись из отвергнутой пачки не сохранена" "" ""
  fi

  # 8. Поле вне белого перечня для сервера не существует: оно не доезжает
  #    до запроса, и запись принимается целиком.
  out=$(push "{\"changes\":{\"entry\":[$(entry 00000000-0000-4000-8000-0000000000b6 "$T" tap ',"выдуманное_поле":1')]}}")
  check "лишнее поле молча отброшено, запись принята" '"accepted"' "$out"
  out=$(pull)
  check "запись с лишним полем в выдаче" "0000000000b6" "$out"

  # 9. quick не массивом: нарушен check в базе, пачка отвергается целиком.
  out=$(push "{\"changes\":{\"theme\":[$(theme_row "$BAD_T" '"250"')]}}")
  check "quick строкой отвергает пачку" 'пачка не принята' "$out"

  echo
  echo "  Тестовые записи удаляются на сервере жёстко - мягкое удаление уедет"
  echo "  на устройства и создаст пустую тему в списке:"
  echo "    delete from entry where id::text like '00000000-0000-4000-8000-0000000000b%';"
  echo "    delete from theme where id in ('$T', '$BAD_T');"
  echo
  echo "  Приведение id::text обязательно: like требует текста, а id объявлен uuid,"
  echo "  и неявного приведения между ними нет. Удалится меньше записей, чем заведено:"
  echo "  те, чьи пачки сервер отверг, до базы не дошли."
fi
echo
echo "Резервные копии"
last=$(tail -3 /var/log/progress-backup.log 2>/dev/null || echo "журнала нет")
echo "  последние строки журнала:"
echo "$last" | sed 's/^/    /'

echo
echo "Пройдено: $pass, сбоев: $fail"
[ "$fail" -eq 0 ]
