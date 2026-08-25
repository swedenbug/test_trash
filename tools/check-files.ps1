# check-files.ps1 — проверка состава проекта.
# Запуск из корня репозитория:  powershell -ExecutionPolicy Bypass -File tools\check-files.ps1
#
# Отвечает на один вопрос: все ли файлы разложены по местам.
# Пустая страница в браузере почти всегда означает пропущенный файл,
# а не ошибку в коде: один отсутствующий модуль обрывает загрузку целиком.

$expected = @(
  '.gitignore',
  'CLAUDE.md',
  'README.md',
  'app.html',
  'assets/css/base.css',
  'assets/css/card.css',
  'assets/css/home.css',
  'assets/css/preview.css',
  'assets/css/tokens.css',
  'assets/icons/icon-180.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/logo.svg',
  'check.html',
  'docs/contracts.md',
  'docs/data-model.md',
  'docs/decisions.md',
  'docs/files.md',
  'docs/module-water.md',
  'docs/modules.md',
  'docs/postgres-route.md',
  'index.html',
  'manifest.webmanifest',
  'robots.txt',
  'src/app.js',
  'src/core/adapter-local.js',
  'src/core/backup.js',
  'src/core/check.js',
  'src/core/migrate.js',
  'src/core/schema.js',
  'src/core/store.js',
  'src/main.js',
  'src/modules/water.js',
  'src/ui/card.js',
  'src/ui/chart.js',
  'src/ui/circle.js',
  'src/ui/gestures.js',
  'src/ui/menu.js',
  'src/ui/recent.js',
  'src/ui/states-card.js',
  'src/ui/states-water.js',
  'src/ui/undo.js',
  'src/ui/water-screen.js',
  'states-card.html',
  'states-water.html'
)

$missing = @()
foreach ($f in $expected) {
  if (-not (Test-Path -LiteralPath $f)) { $missing += $f }
}

$extra = Get-ChildItem -Recurse -File |
  ForEach-Object { (Resolve-Path -Relative $_.FullName) -replace '^\.\\','' -replace '\\','/' } |
  Where-Object { $_ -notlike '.git/*' -and $_ -notlike 'tools/*' -and $expected -notcontains $_ }

Write-Host ""
if ($missing.Count -eq 0) {
  Write-Host "Все файлы на месте: $($expected.Count)" -ForegroundColor Green
} else {
  Write-Host "НЕ ХВАТАЕТ ФАЙЛОВ: $($missing.Count) из $($expected.Count)" -ForegroundColor Red
  $missing | ForEach-Object { Write-Host "   нет: $_" -ForegroundColor Red }
}

if ($extra.Count -gt 0) {
  Write-Host ""
  Write-Host "Лишнее в папке — в репозиторий это не идёт:" -ForegroundColor Yellow
  $extra | ForEach-Object { Write-Host "   лишний: $_" -ForegroundColor Yellow }
}
Write-Host ""
