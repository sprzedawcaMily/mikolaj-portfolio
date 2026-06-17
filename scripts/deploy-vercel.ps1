# Deploy portfolio na Vercel (CLI) + przypomnienie DNS OVH.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

Write-Host "Build produkcyjny..." -ForegroundColor Cyan
bun run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Logowanie / deploy (pierwszy raz: vercel login, potem link projektu)..." -ForegroundColor Cyan
bunx vercel --prod
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "W panelu Vercel -> Project -> Settings -> Domains dodaj:" -ForegroundColor Green
Write-Host "  mmikolajczuk.pl" -ForegroundColor Yellow
Write-Host "  www.mmikolajczuk.pl" -ForegroundColor Yellow
Write-Host ""
Write-Host "W OVH -> mmikolajczuk.pl -> Strefa DNS ustaw (Vercel moze podac inne — sprawdz w panelu):" -ForegroundColor Green
Write-Host "  A     @    -> 76.76.21.21" -ForegroundColor White
Write-Host "  CNAME www  -> cname.vercel-dns.com" -ForegroundColor White
Write-Host ""
Write-Host "Propagacja DNS: zwykle 5–60 min, czasem do 24 h." -ForegroundColor Gray
