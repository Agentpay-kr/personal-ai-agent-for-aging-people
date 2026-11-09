[CmdletBinding()]
param([Parameter(ValueFromRemainingArguments=$true)][string[]]$CloudArgs)
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path (Split-Path -Parent $appRoot) 'phone-harness/src'
$env:PYTHONPATH = $source
$env:PHONE_HARNESS_HOME = Join-Path $appRoot '.data/cloud/operator'
$env:DO_NOT_TRACK = '1'
$env:PHONE_HARNESS_TELEMETRY = '0'
$env:PHONE_HARNESS_NO_UPDATE_CHECK = '1'
$env:PYTHONUTF8 = '1'
$adb = Join-Path $appRoot '.tools/platform-tools/adb.exe'
if (Test-Path -LiteralPath $adb) { $env:PHONE_HARNESS_ADB = $adb }
& python -m phone_harness.run cloud @CloudArgs
exit $LASTEXITCODE
