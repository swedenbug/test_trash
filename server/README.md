# Сервер обмена

Postgres и две ручки поверх него. Устройство отдаёт свои изменения и забирает чужие.

Приложение работает и без сервера: местное хранилище остаётся главным. Сервер — копия и способ видеть одни и те же данные с телефона и с компьютера.

---

## Что понадобится

- Сервер с Ubuntu 22.04 или новее. Самого дешёвого тарифа хватает с запасом.
- Доменное имя, указывающее на этот сервер. Сертификат выдают на имя, а не на адрес.
- Открытые порты 80 и 443. Порт базы наружу не открывается никогда.

---

## Шаг 1. Система и Postgres

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y postgresql nodejs npm caddy unattended-upgrades
sudo dpkg-reconfigure --priority=low unattended-upgrades
```

Пользователь и база:

```bash
sudo -u postgres psql -c "create user progress with password 'ПРИДУМАЙ_ДЛИННЫЙ';"
sudo -u postgres psql -c "create database progress owner progress;"
```

Пароль набирать руками не придётся — он живёт только в `.env`. Пусть будет длинным.

**Проверка:** `sudo -u postgres psql -c "\l"` показывает базу `progress`.

---

## Шаг 2. Таблицы

```bash
sudo mkdir -p /opt/progress
sudo chown $USER /opt/progress
# скопировать сюда содержимое папки server/
psql "postgres://progress:ПАРОЛЬ@localhost/progress" -f /opt/progress/server/schema.sql
```

**Проверка:** `psql ... -c "\dt"` показывает три таблицы.

---

## Шаг 3. Служба

```bash
cd /opt/progress/server
npm install --omit=dev
cp env.example .env
openssl rand -base64 36        # это и есть пропуск, вписать в .env
nano .env                      # заполнить DATABASE_URL, SYNC_TOKEN, ALLOWED_ORIGIN
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

Caddy получает сертификат сам и сам его продлевает. Наружу открыты только `/changes` и `/health`, всё остальное отвечает отказом.

**Проверка с любого компьютера:**

```bash
curl https://ВАШЕ_ИМЯ/health
```

---

## Шаг 5. Закрыть лишнее

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

Вход по паролю отключается **после** того, как проверен вход по ключу. Иначе можно закрыть дверь изнутри и остаться снаружи.

---

## Шаг 6. Резервные копии

```bash
sudo cp backup.sh /opt/progress/server/
sudo chmod +x /opt/progress/server/backup.sh
sudo -u postgres crontab -e
# 0 4 * * *  /opt/progress/server/backup.sh >> /var/log/progress-backup.log 2>&1
```

Скрипт не просто снимает слепок: он разворачивает его во временную базу и считает строки. **Копия, которую ни разу не пробовали восстановить, копией не является.** Не развернулся — слепок удаляется, а в журнале остаётся ошибка.

Слепок лежит на том же диске, что и база. Это спасает от ошибки, но не от потери диска: увоз копии за пределы сервера настраивается отдельно, в конце `backup.sh` есть пример.

---

## Шаг 7. Приложение

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
systemctl status progress-sync caddy postgresql
tail -20 /var/log/progress-backup.log
```

Последняя строка важнее первых двух: она говорит, что копии не просто снимаются, а разворачиваются.

---

## Если что-то не работает

| Признак | Куда смотреть |
|---------|---------------|
| «сервер не принял пропуск» | `SYNC_TOKEN` в `.env` и строка в приложении. Пробел в конце тоже считается |
| Обращение отклонено браузером | `ALLOWED_ORIGIN` должен точно совпадать с адресом приложения, без косой черты |
| «нет сети» при живом интернете | Проверить `curl https://ВАШЕ_ИМЯ/health` — скорее всего дело в сертификате |
| Служба не поднимается | `journalctl -u progress-sync -n 50` |
| Записи не доезжают | В меню видно, сколько ждёт отправки. Ноль означает, что устройство считает всё отправленным |
