# Сервер обмена

Postgres и две ручки поверх него. Устройство отдаёт свои изменения и забирает чужие.

Приложение работает и без сервера: местное хранилище остаётся главным. Сервер — копия и способ видеть одни и те же данные с телефона и с компьютера.

Инструкция проверена на чистой Ubuntu 24.04 с cloud-init.

---

## Что понадобится

- Сервер с Ubuntu 22.04 или новее. Одного ядра и гигабайта памяти хватает с запасом.
- **Настоящее доменное имя**, указывающее на этот сервер.
- Открытые порты 80 и 443. Порт базы наружу не открывается никогда.

**Про домен отдельно.** Технический адрес, который хостер показывает в панели в столбце «Домен», доменом не является. Сертификат на него не выдадут, а Caddy будет молча повторять попытки. Нужно имя, купленное у регистратора и направленное на адрес сервера записью A.

---

## Шаг 1. Система и пакеты

Из репозиториев Ubuntu:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y postgresql unattended-upgrades curl
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

**Node.js — из репозитория проекта.** В Ubuntu 24.04 лежит восемнадцатая версия: формально годится, но обновлений безопасности уже не получает.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v        # ожидаем v22.x
```

**Caddy — тоже из своего репозитория**, в Ubuntu его нет вовсе:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Пользователь базы и сама база:

```bash
sudo -u postgres psql -c "create user progress with password 'ПРИДУМАЙ_ДЛИННЫЙ';"
sudo -u postgres psql -c "create database progress owner progress;"
```

Пароль руками набирать не придётся — он живёт только в `.env`. Пусть будет длинным.

**Проверка:** `sudo -u postgres psql -c "\l"` показывает базу `progress`.

---

## Шаг 2. Файлы и права

```bash
sudo mkdir -p /opt/progress
sudo chown $USER /opt/progress
# скопировать сюда содержимое папки server/
```

**Права проверить отдельно.** Если файлы приехали копированием из домашней папки, они могут прийти с режимом `700`. Владельца сменит следующий шаг, а режим — нет: папка останется закрытой для всех, кроме владельца. Всплывёт это только на шестом шаге и в самой сбивающей с толку форме — `command not found` на существующий файл.

```bash
sudo chmod 755 /opt/progress /opt/progress/server
```

Таблицы:

```bash
psql "postgres://progress:ПАРОЛЬ@localhost/progress" -f /opt/progress/server/schema.sql
```

**Схему применять именно пользователем `progress`.** Таблица принадлежит тому, кто её
создал, а служба ходит в базу пользователем `progress`. Применение от `postgres` — например
через `sudo -u postgres psql`, чтобы не набирать пароль, — заводит таблицы во владении
`postgres`, и служба получает `permission denied for table` на каждую из них. Старые
таблицы при этом работают, потому что создавались правильно, и расхождение выглядит
как поломка новых таблиц, а не как ошибка владельца.

Если схема всё-таки применена от `postgres`, владельца нужно вернуть — по одной строке
на каждую таблицу из `schema.sql`:

```sql
alter table theme owner to progress;
alter table theme_goal owner to progress;
alter table entry owner to progress;
```

**Проверка:** `psql ... -c "\dt"` показывает таблицы, и в колонке владельца везде
`progress`. Одного лишь наличия таблиц недостаточно: с чужим владельцем они тоже видны.

---

## Шаг 3. Служба

```bash
cd /opt/progress/server
npm install --omit=dev
cp env.example .env
openssl rand -base64 36        # это и есть пропуск, вписать в .env
nano .env                      # заполнить DATABASE_URL, SYNC_TOKEN, ALLOWED_ORIGIN
chmod 600 .env                 # обязательно: cp создаёт файл, читаемый всей системой
```

`ALLOWED_ORIGIN` — точный адрес приложения, без косой черты в конце. Для GitHub Pages это `https://имя.github.io`.

Отдельный пользователь и автозапуск:

```bash
sudo useradd -r -s /usr/sbin/nologin progress || true
sudo chown -R progress:progress /opt/progress
sudo cp progress-sync.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now progress-sync
```

**Проверка:** `curl localhost:8787/health` отвечает `{"ok":true,...}`.
Если нет — `journalctl -u progress-sync -n 50` скажет почему.

---

## Шаг 4. Домен и шифрование

```bash
sudo cp Caddyfile.example /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile     # заменить progress.example.com на своё имя
sudo systemctl reload caddy
```

Caddy получает сертификат сам и сам его продлевает. Для этого имя уже должно указывать на этот сервер.

**Проверка с любого другого компьютера:** `curl https://ВАШЕ_ИМЯ/health`

---

## Шаг 5. Закрыть лишнее

Брандмауэр:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

**Отключение входа по паролю — самое опасное место всей инструкции.** Ошибиться здесь означает либо оставить дверь открытой, считая её закрытой, либо закрыть её вместе с собой снаружи.

Сначала убедиться, что вход по ключу работает. Затем найти **все** места, где настройка задана:

```bash
sudo grep -rn "PasswordAuthentication" /etc/ssh/sshd_config /etc/ssh/sshd_config.d/
```

На Ubuntu с cloud-init их обычно два. Файл `/etc/ssh/sshd_config.d/50-cloud-init.conf` **переопределяет основной**: правка только основного файла ничего не меняет. Это молчаливый отказ — команда отработала, а вход по паролю остался открыт.

```bash
sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^PasswordAuthentication.*/PasswordAuthentication no/' \
  /etc/ssh/sshd_config.d/50-cloud-init.conf 2>/dev/null || true

sudo sshd -t && echo "настройки в порядке"    # до перезапуска, не после
sudo systemctl restart ssh
```

Проверка `sshd -t` обязательна: при опечатке служба не поднимется, и обнаружится это в худший из возможных моментов.

**Проверять результат нужно с клиента, а не с сервера:**

```bash
ssh -o PubkeyAuthentication=no пользователь@адрес     # ожидаем Permission denied (publickey)
```

---

## Шаг 6. Резервные копии

Скрипт работает от имени `postgres`, поэтому папку и журнал нужно приготовить заранее — сам он их создать не сможет, обе лежат в чужих владениях:

```bash
sudo mkdir -p /var/backups/progress
sudo chown postgres:postgres /var/backups/progress

sudo touch /var/log/progress-backup.log
sudo chown postgres:postgres /var/log/progress-backup.log
```

Проверить руками:

```bash
sudo -u postgres bash -c '/opt/progress/server/backup.sh >> /var/log/progress-backup.log 2>&1'
tail -5 /var/log/progress-backup.log
```

Обёртка `bash -c` нужна не для красоты: перенаправление выполняет оболочка вызывающего пользователя, ещё до переключения на `postgres`, и упирается в права на журнал.

Расписание:

```bash
sudo -u postgres crontab -e
# 0 4 * * *  /opt/progress/server/backup.sh >> /var/log/progress-backup.log 2>&1
```

Скрипт не просто снимает слепок: он разворачивает его во временную базу и считает строки. **Копия, которую ни разу не пробовали восстановить, копией не является.** Не развернулся — слепок удаляется, а в журнале остаётся ошибка.

Слепок лежит на том же диске, что и база. Это спасает от ошибки, но не от потери диска: увоз копии за пределы сервера настраивается отдельно, в конце `backup.sh` есть пример.

---

## Шаг 7. Проверка делом

Все команды `systemctl enable` — пока лишь записи. Автозапуск, который ни разу не проверяли перезагрузкой, автозапуском не является. Та же логика, что и с резервными копиями.

```bash
sudo reboot
# минуту спустя:
/opt/progress/server/selftest.sh ВАШЕ_ИМЯ ПРОПУСК
```

`selftest.sh` проверяет и разрешённое, и закрытое: службы подняты, ручки отвечают, корень отдаёт отказ, обмен без пропуска отклонён, порт базы снаружи недоступен.

Проверять закрытое важнее, чем открытое: сломанное разрешённое видно сразу, а незакрытая дверь молчит.

**Прогон с клиента — отдельно и обязательно.** Часть проверок честна только снаружи:
закрытый порт базы, отвечающий домен, действующий сертификат. С Windows — в Git Bash,
из корня репозитория:

```bash
bash server/selftest.sh ВАШЕ_ИМЯ ПРОПУСК
```

**Именно `bash <файл>`, а не `./server/selftest.sh`.** Бит выполнения Git Bash только
рисует: `ls` показывает `-rwxr-xr-x`, но Windows прав доступа не хранит, и запуск
отвечает `No such file or directory` — сообщение указывает на отсутствующий файл,
хотя файл на месте, и время уходит на поиск не там.

Блоки «Службы» и «Резервные копии» с клиента дадут сбой: `systemctl` и журнал живут
на сервере. Это не отказ, а граница прогона — их смотрят серверным запуском.

---

## Шаг 8. Приложение

В приложении: меню → раздел «Сервер».

1. Адрес обмена: `https://ВАШЕ_ИМЯ`
2. Пропуск: строка из `SYNC_TOKEN`
3. Сохранить → Проверить связь → Синхронизировать

Дальше обмен идёт сам: при запуске, при возвращении сети, раз в пять минут при открытом приложении и при возвращении на вкладку. В фоне iOS ничего не выполняет, и рассчитывать на это нельзя.

---

## Ручки

| Запрос | Что делает |
|--------|-----------|
| `GET /health` | Жив ли сервер. Пропуск не нужен |
| `GET /changes?since=<ISO>` | Отдаёт изменения после указанного момента и своё текущее время |
| `POST /changes` | Принимает пачку. Побеждает запись с более поздним `updated_at` |

Пропуск передаётся заголовком `Authorization: Bearer <строка>`. Сравнение постоянного времени: обычное «равно» подсказывает длину и совпавшие символы тому, кто измеряет время ответа.

Список таблиц и полей задан в коде и никакими запросами не расширяется.

---

## Обслуживание

Раз в пару месяцев:

```bash
sudo apt update && sudo apt upgrade -y
/opt/progress/server/selftest.sh ВАШЕ_ИМЯ ПРОПУСК
tail -20 /var/log/progress-backup.log
```

Последняя строка важнее первых двух: она говорит, что копии не просто снимаются, а разворачиваются.

---


## Обновление файлов

Установка ставит владельца один раз, командой `chown -R progress:progress` на шаге 3.
Файлы, привезённые позже, этой командой не охвачены и приезжают чужими: `sudo install`
и `sudo cp` оставляют владельцем `root`. Служба такие файлы читает, режим `644` это
позволяет, но в папке появляется разнобой, а юнит работает с `ProtectSystem=strict`.

Поэтому владелец задаётся тем же действием, что и копирование, — у `install` для
этого есть `-o` и `-g`. Отдельный `chown` следом не нужен:

С локальной машины:

```bash
scp server/schema.sql server/index.js server/selftest.sh server/README.md \
    ПОЛЬЗОВАТЕЛЬ@ВАШЕ_ИМЯ:/tmp/
```

На сервере:

```bash
sudo install -m 644 -o progress -g progress \
     /tmp/schema.sql /tmp/index.js /tmp/README.md /opt/progress/server/
sudo install -m 755 -o progress -g progress /tmp/selftest.sh /opt/progress/server/
sudo systemctl restart progress-sync
```

**Этот файл везётся вместе с остальными,** хотя служба его не читает. Инструкция,
разошедшаяся с репозиторием, опаснее отсутствующей: её открывают на машине,
где чинят, и следуют ей как действующей.

**Проверка:** `ls -l /opt/progress/server` — владелец `progress` у всех файлов,
`systemctl is-active progress-sync` отвечает `active`.

Если менялась схема — применить `schema.sql` заново. Владельца он чинит сам,
тремя `alter table … owner` в конце файла.

**Перед обновлением — копия с разворотом.** Копия, которую ни разу не пробовали
восстановить, копией не является:

```bash
sudo -u postgres pg_dump -Fc progress > /tmp/progress-before.dump
sudo -u postgres dropdb --if-exists progress_check
sudo -u postgres createdb progress_check
sudo -u postgres pg_restore -d progress_check /tmp/progress-before.dump
sudo -u postgres psql -d progress_check -c '\dt'
```

`dropdb --if-exists` обязателен: проверочная база остаётся от прошлого обновления,
и `createdb` без него спотыкается на втором заходе.

**Проверка:** счёт строк в обеих базах совпадает.

```bash
for db in progress progress_check; do
  echo -n "$db: "; sudo -u postgres psql -tAd $db -c 'select count(*) from water_intake;'
done
```

---
## Если что-то не работает

| Признак | Куда смотреть |
|---------|---------------|
| «сервер не принял пропуск» | `SYNC_TOKEN` в `.env` и строка в приложении. Пробел в конце тоже считается |
| Обращение отклонено браузером | `ALLOWED_ORIGIN` должен точно совпадать с адресом приложения, без косой черты |
| Caddy не получает сертификат | Имя должно указывать на сервер. Технический адрес хостера сертификата не получит |
| `command not found` на существующий скрипт | Права на папку: `sudo chmod 755 /opt/progress /opt/progress/server` |
| Копии не снимаются | Папка и журнал должны принадлежать `postgres`, см. шаг 6 |
| Вход по паролю остался открыт | `sshd_config.d/50-cloud-init.conf` переопределяет основной файл |
| Служба не поднимается | `journalctl -u progress-sync -n 50` |
| `permission denied for table` на части таблиц | Схему применили от `postgres`. Вернуть владельца, см. шаг 2 |
| `operator does not exist: uuid ~~ unknown` | `like` по колонке `uuid`. Нужно `id::text like '...'` |
| `No such file or directory` на существующий `selftest.sh` | Git Bash на Windows. Запускать `bash server/selftest.sh`, а не `./server/…` |
| `database "progress_check" already exists` | Осталась от прошлого обновления. `dropdb --if-exists` перед `createdb` |
| Записи не доезжают | В меню видно, сколько ждёт отправки. Ноль означает, что устройство считает всё отправленным |
