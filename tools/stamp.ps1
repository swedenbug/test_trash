# stamp.ps1 - otpechatok versii i peresborka spiska summ.
#
# Zapusk iz kornya repozitoriya, POSLEDNIM deystviem zakhoda:
#   powershell -ExecutionPolicy Bypass -File tools\stamp.ps1
#
# Delaet dve veshchi odnoy komandoy:
#   1. Pishet src/version.js - otpechatok soderzhimogo i vremya sborki.
#   2. Peresobiraet spisok kontrolnykh summ v tools\check-files.ps1.
#
# Pochemu ne khesh kommita: fayl s kheshem lezhit vnutri togo zhe kommita,
# i uznat ego do kommita nevozmozhno. Otpechatok schitaetsya po soderzhimomu
# vsekh faylov - on identifitsiruet imenno tu sborku, kotoraya vylozhena.
#
# Fayl namerenno bez kirillitsy: Windows PowerShell chitaet .ps1 v ANSI.

$ErrorActionPreference = 'Stop'

$VER   = 'src/version.js'
$CHECK = 'tools/check-files.ps1'

# --- sostav repozitoriya ---------------------------------------------------

$files = Get-ChildItem -Recurse -File |
  ForEach-Object { (Resolve-Path -Relative $_.FullName) -replace '^\.\\','' -replace '\\','/' } |
  Where-Object {
    $_ -notlike '.git/*' -and $_ -notlike 'tools/*' -and
    $_ -notlike 'server/node_modules/*' -and $_ -ne 'server/.env' -and
    $_ -notlike 'preview-*.png'
  } | Sort-Object

# --- otpechatok ------------------------------------------------------------
# Sam version.js iz podscheta isklyuchen: inache ego zapis menyala by otpechatok,
# a novyy otpechatok - snova fayl. Bez isklyucheniya eto ne skhoditsya nikogda.

$sb = New-Object System.Text.StringBuilder
foreach ($f in ($files | Where-Object { $_ -ne $VER })) {
  [void]$sb.AppendLine("$f=$((Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash)")
}

$sha   = [System.Security.Cryptography.SHA256]::Create().ComputeHash(
           [System.Text.Encoding]::ASCII.GetBytes($sb.ToString()))
$stamp = ([System.BitConverter]::ToString($sha) -replace '-','').Substring(0,8).ToLower()
$built = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

$body = @"
/*
  version.js - отпечаток собранной версии.
  Назначение: показать в меню, какая именно сборка сейчас исполняется.
  Зависимости: нет.

  Файл пишет tools/stamp.ps1 последним действием захода. Руками не править:
  отпечаток считается по содержимому всех файлов репозитория, и правка
  вручную сделала бы его неправдой ровно тогда, когда он понадобится -
  когда непонятно, та ли версия работает на телефоне.
*/

export const VERSION = {
  stamp: '$stamp',
  built: '$built',
};
"@

$root = (Resolve-Path -LiteralPath '.').Path
$tmp  = Join-Path $root 'src\version.js.tmp'
[System.IO.File]::WriteAllText($tmp, $body, (New-Object System.Text.UTF8Encoding($false)))
Move-Item -LiteralPath $tmp -Destination (Join-Path $root 'src\version.js') -Force

if ($files -notcontains $VER) { $files = @($files + $VER) | Sort-Object }

# --- spisok summ -----------------------------------------------------------

$lines = Get-Content -LiteralPath $CHECK -Encoding UTF8
$start = ($lines | Select-String -Pattern '^\$expected = @\{$' | Select-Object -First 1).LineNumber
$end   = $start
while ($lines[$end] -notmatch '^\}$') { $end++ }

$was = @($lines[$start..($end-1)] | ForEach-Object {
  if ($_ -match "^\s*'([^']+)'\s*=") { $matches[1] }
})

$rows = foreach ($f in $files) {
  "  '$f' = '$((Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash)'"
}

$out = @()
$out += $lines[0..($start-1)]
$out += $rows
$out += $lines[$end..($lines.Count-1)]

$tmp2 = Join-Path $root 'tools\check-files.ps1.tmp'
[System.IO.File]::WriteAllLines($tmp2, $out, (New-Object System.Text.ASCIIEncoding))
Move-Item -LiteralPath $tmp2 -Destination (Join-Path $root $CHECK) -Force

# --- otchet ----------------------------------------------------------------
# Spisok stroitsya po derevu, a ne po prezhnemu spisku: inache novyy fayl
# nikogda by v nego ne popal. Poetomu vsyakoe izmenenie sostava - vsluh.

$added   = $files | Where-Object { $was -notcontains $_ }
$dropped = $was   | Where-Object { $files -notcontains $_ }

Write-Host ""
Write-Host "Otpechatok: $stamp   sobrano: $built"
Write-Host "V spiske faylov: $($files.Count)"

if ($added)   { Write-Host ""; Write-Host "DOBAVLENO v spisok: $($added.Count)" -ForegroundColor Yellow
                $added   | ForEach-Object { Write-Host "   $_" -ForegroundColor Yellow } }
if ($dropped) { Write-Host ""; Write-Host "UBRANO iz spiska: $($dropped.Count)" -ForegroundColor Yellow
                $dropped | ForEach-Object { Write-Host "   $_" -ForegroundColor Yellow } }
if (-not $added -and -not $dropped) { Write-Host "Sostav ne izmenilsya." }
