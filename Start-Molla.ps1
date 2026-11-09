param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Join-Path $PSScriptRoot 'molla-app'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodeExe)) { throw 'Node.js 24 이상을 설치해 주세요.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'live\mobile\index.html'))) { throw 'molla-app/scripts/build-live.ps1을 먼저 실행해 주세요.' }
$appUrl = 'http://127.0.0.1:4318'
$ready = $false
try { $ready = (Invoke-RestMethod "$appUrl/api/health" -TimeoutSec 2).ok -eq $true } catch { }
if (-not $ready) {
  $process = Start-Process -FilePath $nodeExe -ArgumentList @('--env-file-if-exists=.env', 'server/index.mjs') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 250
    try { $ready = (Invoke-RestMethod "$appUrl/api/health" -TimeoutSec 2).ok -eq $true; if ($ready) { break } } catch { }
  }
  if (-not $ready) { throw '몰라 서버를 시작하지 못했어요. 4318 포트와 Node.js 버전을 확인해 주세요.' }
  Write-Host "Molla 서버 PID: $($process.Id)"
}
Write-Host "Molla: $appUrl"
$health = Invoke-RestMethod "$appUrl/api/health" -TimeoutSec 3
if ($health.mode -ne 'live') { throw '서버가 실제 연결 모드가 아닙니다. scripts/enable-live.ps1 실행 후 서버를 다시 시작해 주세요.' }
Write-Host '실제 AI에 연결하는 앱 검토 화면입니다. VM은 비용 확인 후 직접 시작할 때만 실행됩니다.'
Write-Host '각 사용자 접속 코드는 molla-app/.data/owner-access.txt에 있습니다.'
if (-not $NoBrowser) { Start-Process $appUrl }
