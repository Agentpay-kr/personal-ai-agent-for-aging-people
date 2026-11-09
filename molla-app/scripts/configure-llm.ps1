[CmdletBinding()]
param([string]$Model = 'openai/gpt-5-mini')
$ErrorActionPreference = 'Stop'
$appRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $appRoot '.env'
$secret = Read-Host 'Vercel AI Gateway API key (hidden; never paste into chat)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
    $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    if ($apiKey -notmatch '^[A-Za-z0-9_.-]{16,512}$') { throw 'Invalid key format. Nothing was saved.' }
    if ($Model -notmatch '^[a-z0-9._-]+/[a-zA-Z0-9._-]+$') { throw 'Invalid model ID.' }
    $lines = if (Test-Path -LiteralPath $envPath) { @(Get-Content -LiteralPath $envPath) } else { @() }
    $lines = @($lines | Where-Object { $_ -notmatch '^\s*(AI_GATEWAY_API_KEY|MOLLA_MODEL|MOLLA_LLM_ENABLED)\s*=' })
    $lines += 'AI_GATEWAY_API_KEY=' + $apiKey
    $lines += 'MOLLA_MODEL=' + $Model
    $lines += 'MOLLA_LLM_ENABLED=1'
    [IO.File]::WriteAllLines($envPath, $lines, [Text.UTF8Encoding]::new($false))
    if ($env:OS -eq 'Windows_NT') {
        $acl = Get-Acl -LiteralPath $envPath
        $acl.SetAccessRuleProtection($true, $false)
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'Allow')
        $acl.AddAccessRule($rule)
        Set-Acl -LiteralPath $envPath -AclObject $acl
    }
    Write-Host 'Saved locally. No key was printed. Molla will use the key after the API restarts.'
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    $apiKey = $null
    $secret.Dispose()
}
