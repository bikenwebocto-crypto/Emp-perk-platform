# Loads env vars from .env, then runs the connection-pool-exhaustion k6 test.
# Usage (smoke test, run this first): .\load\k6\run-pool-test.ps1 -Smoke
# Usage (full ramp, ~8 minutes):      .\load\k6\run-pool-test.ps1

param([switch]$Smoke)

$envFile = Join-Path $PSScriptRoot "..\..\.env"
if (-not (Test-Path $envFile)) {
    Write-Error ".env not found at $envFile"
    exit 1
}

Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)\s*=\s*(.*)\s*$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim().Trim('"').Trim("'")
        [System.Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

# The app's .env uses NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
# but connection-pool-exhaustion.js reads SUPABASE_URL / SUPABASE_ANON_KEY. Map them.
if (-not $env:SUPABASE_URL -and $env:NEXT_PUBLIC_SUPABASE_URL) {
    $env:SUPABASE_URL = $env:NEXT_PUBLIC_SUPABASE_URL
}
if (-not $env:SUPABASE_ANON_KEY -and $env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    $env:SUPABASE_ANON_KEY = $env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
}

if (-not $env:BASE_URL) { $env:BASE_URL = "https://staging.perksandmore.com" }
if (-not $env:TEST_EMAIL) { $env:TEST_EMAIL = "superadmin@test.perks" }
if (-not $env:TEST_PASSWORD) { $env:TEST_PASSWORD = "admin@123" }

Write-Host "BASE_URL: $env:BASE_URL"
Write-Host "SUPABASE_URL: $env:SUPABASE_URL"
Write-Host "SUPABASE_ANON_KEY set: $([bool]$env:SUPABASE_ANON_KEY)"
Write-Host "TEST_EMAIL: $env:TEST_EMAIL"

$scriptPath = Join-Path $PSScriptRoot "connection-pool-exhaustion.js"

if ($Smoke) {
    k6 run --vus 1 --iterations 3 $scriptPath
} else {
    k6 run $scriptPath
}