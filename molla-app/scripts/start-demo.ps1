$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
Push-Location $root
try { if(!(Test-Path -LiteralPath (Join-Path $root 'demo/mobile/index.html'))){& (Join-Path $PSScriptRoot 'build-demo.ps1')}; & node server/demo.mjs } finally { Pop-Location }
