# check-files.ps1 - proverka sostava i svezhesti faylov.
#
# Zapusk iz kornya repozitoriya:
#   powershell -ExecutionPolicy Bypass -File tools\check-files.ps1
#
# Otvechaet na dva voprosa: vse li fayly na meste i ne ostalsya li kakoy-to
# ot proshloy versii. Vtoroe vazhnee: otsutstvuyushchiy fayl daet ponyatnuyu
# oshibku 404, a ustarevshiy lomaetsya uzhe v rabote.
#
# Fayl namerenno bez kirillitsy: Windows PowerShell chitaet .ps1 v ANSI,
# i russkiy tekst prevrashchaetsya v nabor simvolov, sredi kotorykh
# popadayutsya tipograficheskie kavychki. PowerShell schitaet ikh nastoyashchimi
# kavychkami, stroka obryvaetsya poseredine i razbor padaet na sluchaynoy skobke.

$expected = @{
  '.gitignore' = 'CF548CE90E15CA8B246E75E4AB6ED9623008171E15371F01C609240624550D27'
  'CLAUDE.md' = '6682C83875F713FC5C64C703420C4D50657DB7A5AB14A03EA1345D63B1917F1E'
  'README.md' = 'E44BA520BE50C19E6F9E6E02ED1765B1B87B1831BBD8C6B0CF6CA98DFC303B8B'
  'app.html' = '75CD7F895E75C2D7D648D9F72DBD7BC8392FF6D061222DC91953CEB4E132DC80'
  'assets/css/base.css' = '4DC3611A3FCD4490D49C237AF42C837DCF32026F9D94B545A218478E8035C4B3'
  'assets/css/card.css' = 'C777EA82D006BB620E3FEC9CC6BECD757C807460BD1018A0E722059C62103054'
  'assets/css/home.css' = '2EC77734AC17F31279D56DBD392BBC973614BDAE52777B89D0318A09F11FD862'
  'assets/css/preview.css' = '15CCF6FA2618246AC78B2A1E7D6335F6EDC4237728C891FE26837B699196B84D'
  'assets/css/tokens.css' = 'BC66625A6B184294C314A5E67D914FDE4306A8FC154BD257998C3F3BEEA67907'
  'assets/icons/icon-180.png' = 'D36C730590EB63CCF27677B0DADD27A87822120771E00814295C28195A7891C9'
  'assets/icons/icon-192.png' = 'F78CB6271C462C1513FC124BE990EC1D06D43CC2455A1FE8A3E6E82DADCF37E9'
  'assets/icons/icon-512.png' = 'EE4238EA8EE8C9A387FD292455E27727EB7F43865F68586C71F904C457822434'
  'assets/icons/logo.svg' = '79910CC70F9A1C6EF2D74A06622327BF56D2ADDB3BE51C9843D543B19F2BA652'
  'check.html' = 'B9389C11CDC233D1AFF868B0E9C2763BA4C690C18534E6FFF02CEEE879C29622'
  'docs/contracts.md' = 'B8395DC63F0827755CD3138B0DB83CAFFBE88158FB23E68A2511A9DE4FE06E03'
  'docs/data-model.md' = '31C9463380C51DC2B7CD241CA01EC1696BB60F65A549ACE920CB425DD5D94E0F'
  'docs/decisions.md' = '390B0686A53E20469FF453E84F726B404DEDCBD19397CE14E7D7105E50B8D3BB'
  'docs/files.md' = '336470C30C715D92C1D347DDD4C8F6A844D1D7C2AF6C9A03819D0C16D665F243'
  'docs/module-water.md' = '4EB4E413BDBD13E2D74393536D9AD8CB8A91ED694612D35B0734DD5DDB5A007F'
  'docs/modules.md' = '215E492E2B875CE5FE0C07EFF907B9271809959B6EC5F307F58828B2619BE552'
  'docs/postgres-route.md' = '8B910AE8D8072E50BFE6A06D3C6C357E11F122F1ED64073BF97AB0D7710FF839'
  'index.html' = '8B706A09E7A675B4F686A83A78D91483CB7A265C76C5FC0479C279D60A3D3A83'
  'manifest.webmanifest' = 'DDEC1DFD7D8EF5548702468289795E3023BA962F7214BDBED9B6D2E7D6160BDC'
  'robots.txt' = 'A0EA73F265F5A1A17B77B73AE2217348D8C31B6F84D79B22E7CAF06397F58ED8'
  'src/app.js' = '8C5879BD8FCCBA4CB8325E66E871450396B5C66DC9A58E52C9206039E594FF63'
  'src/core/adapter-local.js' = '889C958A57ADBDFF003D637987E1839BA31FC21CA871CDDFBE870A045D829D30'
  'src/core/backup.js' = '36C5BEAACF71FF30945DA513327CF73FB897DCA5345B029DC3E1A60877940B08'
  'src/core/check.js' = 'D42AC5157B4105659DE8BFF7E3F71151D6FFA966D85526FA2A3A00A52993755C'
  'src/core/migrate.js' = 'A87AE36443A7D884BC1E7EE846DE67ECA3306022913F9BE85C8D7FAB2161ADA6'
  'src/core/schema.js' = 'C3BBB25CF2A753214FDC4EEBF4377078763914D5F4724D8CCBA4442610425C86'
  'src/core/store.js' = '52D3AE4C5A49139498FD30D183C67319338BFC37718DB7CC71529B883474CCD2'
  'src/main.js' = 'D1D540F5B1882E93BB89004ADB81C0CBF7389B51FA2950B7B7BD9F0E8A16829D'
  'src/modules/water.js' = 'E765633201EE07A2AC047BA8C7D7D75BC853A9B975A86D1E3A0E56261C1B70D1'
  'src/ui/card.js' = '06C2D263E6EE5307B88D811E255BEC2CFBED2AC7DF85A38C5C98BF5DBDACF03F'
  'src/ui/chart.js' = '8345438840D74E457475D0766F6B01A17EDF2FE9E0FB2521FA9895524B9099AB'
  'src/ui/circle.js' = 'D00E3DC1EE0DF044962EF72F64F0CDBDFC818E8FC6A57EFBB852AD320BC3F648'
  'src/ui/gestures.js' = '96A93A65F41424E5976D62A849B1EC127C709EDB2261540115CF718E5EBA30CE'
  'src/ui/menu.js' = '46DC4379B326BB33F465B5B0877F76A4EAAA2DBA8FEF2CA2DC5DE5DD58D7E419'
  'src/ui/recent.js' = '6F04B1F15D7003BA12244F7F5BED7AEFDD4B89B4B403798FFFDF5A808AEB402C'
  'src/ui/states-card.js' = 'CC3184E57E0E00BC4D32229F659CB455B297D7D27E3514536002A3E20AAE264C'
  'src/ui/states-water.js' = '537D1B8B48D9DF8B5F7FD46F04E9AECACBA4DC0A736E26F088237693950B230E'
  'src/ui/undo.js' = '1B650E00ED4471895655DF90FCEB360D381A0B75F642CB2D64A07F93542F4294'
  'src/ui/water-screen.js' = '06D9581C7501B7778D7D20AD2484C12FF3811D9253489643C8FD979DC5D1D39D'
  'states-card.html' = '3CCF2BA358D801CBFEE7FCB6B232A8138E280A0C7BC59753CE83DE7E72494BEA'
  'states-water.html' = 'FCD9FA62BDD66F848646E3BBBE82239B156DBE33241B9953394B6BFBE039B635'
}

$missing = @()
$stale   = @()

foreach ($f in $expected.Keys) {
  if (-not (Test-Path -LiteralPath $f)) {
    $missing += $f
    continue
  }
  $hash = (Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash
  if ($hash -ne $expected[$f]) { $stale += $f }
}

$known = $expected.Keys
$extra = Get-ChildItem -Recurse -File |
  ForEach-Object { (Resolve-Path -Relative $_.FullName) -replace '^\.\\','' -replace '\\','/' } |
  Where-Object { $_ -notlike '.git/*' -and $_ -notlike 'tools/*' -and $known -notcontains $_ }

Write-Host ""
Write-Host "Vsego v spiske: $($expected.Count)"

if ($missing.Count -eq 0 -and $stale.Count -eq 0) {
  Write-Host "OK - vse na meste i vse svezhee." -ForegroundColor Green
}

if ($missing.Count -gt 0) {
  Write-Host ""
  Write-Host "NET FAYLA: $($missing.Count)" -ForegroundColor Red
  $missing | Sort-Object | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
}

if ($stale.Count -gt 0) {
  Write-Host ""
  Write-Host "USTAREL, nuzhna svezhaya versiya: $($stale.Count)" -ForegroundColor Yellow
  $stale | Sort-Object | ForEach-Object { Write-Host "   $_" -ForegroundColor Yellow }
}

if ($extra.Count -gt 0) {
  Write-Host ""
  Write-Host "LISHNEE v papke - v repozitoriy eto ne idet:" -ForegroundColor DarkYellow
  $extra | Sort-Object | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkYellow }
}
Write-Host ""
