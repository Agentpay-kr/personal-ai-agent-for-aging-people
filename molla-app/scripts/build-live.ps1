$ErrorActionPreference = 'Stop'
$productRoot = Split-Path $PSScriptRoot -Parent
$mobileRoot = Join-Path $productRoot 'apps/mobile'
$names = @('EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_ALLOW_LOCAL_API', 'EXPO_PUBLIC_DEMO_MODE')
$saved = @{}
foreach ($name in $names) { $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
Push-Location $mobileRoot
try {
  $env:EXPO_PUBLIC_API_URL = 'http://127.0.0.1:4318'
  $env:EXPO_PUBLIC_ALLOW_LOCAL_API = '1'
  $env:EXPO_PUBLIC_DEMO_MODE = '0'
  & pnpm exec expo export --platform web --output-dir ../../live/mobile
  if ($LASTEXITCODE -ne 0) { throw '실제 연결용 앱 화면을 빌드하지 못했습니다.' }
  Write-Host 'Local live review exported. No API key or app access code is included.'
} finally {
  Pop-Location
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process') }
}
