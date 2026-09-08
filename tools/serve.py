#!/usr/bin/env python3
"""
serve.py - локальный сервер для разработки.
Назначение: отдавать файлы репозитория без кэширования.
Зависимости: только стандартная библиотека.

    py tools\\serve.py            затем http://localhost:8000/app.html

Зачем не `python -m http.server`. Тот отдаёт файлы без указаний о кэшировании,
и браузер решает сам: часть запросов повторяет, часть берёт из памяти и на сервер
не ходит вовсе. Файл на диске свежий, проверка сумм довольна, а в браузере
работает прежняя версия - и ошибка выглядит как ошибка в коде. Этот сервер
запрещает кэширование заголовком и снимает такие поиски целиком.
"""

import sys
from functools import partial
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

PORT = 8000
ROOT = Path(__file__).resolve().parent.parent

# Типы задаются явно. На Windows mimetypes читает реестр, и .js там нередко
# оказывается text/plain - браузер отказывается исполнять модуль, а в консоли
# пишет про MIME, а не про файл. Ошибка при этом не в коде и не в разметке.
TYPES = {
    '.js':           'text/javascript',
    '.mjs':          'text/javascript',
    '.css':          'text/css',
    '.json':         'application/json',
    '.webmanifest':  'application/manifest+json',
    '.svg':          'image/svg+xml',
    '.html':         'text/html',
}


class NoCacheHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, **TYPES}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        # Короче стандартного: в журнале нужен только путь и код ответа.
        sys.stderr.write('  %s\n' % (fmt % args))


def main():
    handler = partial(NoCacheHandler, directory=str(ROOT))
    try:
        server = HTTPServer(('127.0.0.1', PORT), handler)
    except OSError as e:
        # Занятый порт - обычное дело: забытый прошлый запуск в другом окне.
        print(f'Порт {PORT} занять не удалось: {e}')
        print('Скорее всего сервер уже запущен в другом окне.')
        return 1

    print(f'Раздаю {ROOT}')
    print(f'  http://localhost:{PORT}/            проверка контура')
    print(f'  http://localhost:{PORT}/check.html  самопроверка ядра')
    print(f'  http://localhost:{PORT}/app.html    приложение')
    print('Остановить - Ctrl+C')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nОстановлен.')
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
