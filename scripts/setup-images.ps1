# Mapuje pliki z folderu zdjecia/ na public/images/
$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $root "zdjecia"
$dst = Join-Path $root "public\images"

$map = @{
  "transitrank-dashboard*" = "transitrank\dashboard.png"
  "transitrank-reviews*"    = "transitrank\reviews.png"
  "transitrank-add*"        = "transitrank\add-review.png"
  "transitrank-planner*"    = "transitrank\planner.png"
  "transitrank-more*"       = "transitrank\more.png"
  "forkfull-home*"          = "forkfull\home.png"
  "forkfull-meal*"          = "forkfull\meal.png"
  "forkfull-breakdown*"     = "forkfull\breakdown.png"
  "forkfull-plan*"          = "forkfull\plan.png"
  "forkfull-settings*"      = "forkfull\settings.png"
  "kamochi*"                = "kamochi\store.png"
}

New-Item -ItemType Directory -Force -Path $dst | Out-Null
foreach ($folder in @("transitrank", "forkfull", "kamochi")) {
  New-Item -ItemType Directory -Force -Path (Join-Path $dst $folder) | Out-Null
}

if (-not (Test-Path $src)) {
  Write-Host "Brak folderu zdjecia/. Dodaj PNG i uruchom ponownie."
  exit 0
}

$files = Get-ChildItem $src -File -Include *.png,*.jpg,*.webp
if ($files.Count -eq 0) {
  Write-Host "Folder zdjecia/ jest pusty. Skopiuj tam screeny z czatu lub telefonu."
  exit 0
}

$i = 0
$order = @(
  "transitrank\dashboard.png",
  "transitrank\reviews.png",
  "transitrank\add-review.png",
  "transitrank\planner.png",
  "transitrank\more.png",
  "forkfull\home.png",
  "forkfull\meal.png",
  "forkfull\breakdown.png",
  "forkfull\plan.png",
  "forkfull\settings.png",
  "kamochi\store.png"
)

foreach ($f in $files | Sort-Object Name) {
  if ($i -ge $order.Count) { break }
  $target = Join-Path $dst $order[$i]
  Copy-Item $f.FullName $target -Force
  Write-Host "OK: $($f.Name) -> $target"
  $i++
}

Write-Host "Gotowe ($i plików)."
