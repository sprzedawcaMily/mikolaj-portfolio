# Buduje produkcję i przypomina co wgrać na hosting OVH (FTP → katalog www).
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "Building production..." -ForegroundColor Cyan
bun run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$dist = Join-Path (Get-Location) "dist"
Write-Host ""
Write-Host "Gotowe. Wgraj ZAWARTOSC folderu dist na hosting OVH:" -ForegroundColor Green
Write-Host "  $dist" -ForegroundColor Yellow
Write-Host ""
Write-Host "FTP: katalog www (lub public_html) — pliki bezposrednio w srodku, nie caly folder dist." -ForegroundColor White
Write-Host "  index.html, assets/, images/, favicon.svg, .htaccess" -ForegroundColor Gray
Write-Host ""
Write-Host "Domena: mmikolajczuk.pl — rekordy A @ i www musza wskazywac IP hostingu (nie 213.186.33.5)." -ForegroundColor White
