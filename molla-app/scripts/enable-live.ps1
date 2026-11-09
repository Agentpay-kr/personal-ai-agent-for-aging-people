[CmdletBinding()]
param([switch]$Lan)
$ErrorActionPreference='Stop'
$appRoot=Split-Path -Parent $PSScriptRoot
$nodeArgs=@((Join-Path $PSScriptRoot 'enable-live.mjs'))
if($Lan){$nodeArgs+='--lan'}
& node @nodeArgs
if($LASTEXITCODE -ne 0){throw 'Live setup failed.'}
foreach($relative in @('.env','.data/owner-auth.json','.data/owner-access.txt')){
 $file=Join-Path $appRoot $relative
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
 & icacls.exe $file /inheritance:r /grant:r ($identity + ':(F)') | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Could not restrict local configuration permissions.'}
}
Write-Host 'Owner-only Windows permissions applied. No tokens were printed.'
