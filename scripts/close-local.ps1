$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot '.wrangler\local-server.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Host 'No Recall server started by the launcher is recorded.'; exit 0 }

$serverProcessId = [int](Get-Content -LiteralPath $pidFile -Raw)
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $serverProcessId"
if ($process) {
  $scriptPath = Join-Path $projectRoot 'scripts\run-framework.mjs'
  if (-not $process.CommandLine.Contains($scriptPath)) {
    throw 'The recorded process is not this Recall server. Nothing was stopped.'
  }
  Stop-Process -Id $serverProcessId -ErrorAction Stop
}
Remove-Item -LiteralPath $pidFile
Write-Host 'Local Recall server stopped. Your study data is saved on this PC.'
