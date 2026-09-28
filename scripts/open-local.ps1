param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

$nodeCandidates = @(
  (Get-Command node.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1),
  (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'),
  (Join-Path $env:ProgramFiles 'nodejs\node.exe')
)
$node = $null
foreach ($candidate in $nodeCandidates) {
  if (-not $candidate -or -not (Test-Path -LiteralPath $candidate)) { continue }
  $versionText = & $candidate -p 'process.versions.node' 2>$null
  if ($LASTEXITCODE -eq 0 -and [version]$versionText -ge [version]'22.13.0') {
    $node = $candidate
    break
  }
}
if (-not $node) { throw 'Node.js 22.13 or newer is required. Install Node.js, then open Recall again.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules\vinext\dist\cli.js'))) {
  throw 'Recall dependencies are missing. Run npm ci in this folder, then open Recall again.'
}

$url = 'http://127.0.0.1:5173/'
function Test-RecallServer {
  try {
    $response = Invoke-WebRequest -Uri ($url + 'api/study') -UseBasicParsing -TimeoutSec 2
    $data = $response.Content | ConvertFrom-Json
    return ($response.StatusCode -eq 200 -and $null -ne $data.settings -and $null -ne $data.records)
  } catch { return $false }
}

if (-not (Test-RecallServer)) {
  & $node (Join-Path $projectRoot 'scripts\init-local-db.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the local study database.' }
  $outLog = Join-Path $projectRoot '.wrangler\local-server.log'
  $errorLog = Join-Path $projectRoot '.wrangler\local-server-error.log'
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outLog) | Out-Null
  $scriptArgument = '"' + (Join-Path $projectRoot 'scripts\run-framework.mjs') + '"'
  $server = Start-Process -FilePath $node -ArgumentList @($scriptArgument, 'dev') -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errorLog -PassThru
  Set-Content -LiteralPath (Join-Path $projectRoot '.wrangler\local-server.pid') -Value $server.Id
  $ready = $false
  for ($attempt = 0; $attempt -lt 90; $attempt++) {
    if (Test-RecallServer) { $ready = $true; break }
    if ($server.HasExited) { break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) {
    $detail = if (Test-Path -LiteralPath $errorLog) { (Get-Content -LiteralPath $errorLog -Tail 8) -join [Environment]::NewLine } else { 'No server log was written.' }
    throw "Recall could not start on 127.0.0.1:5173. $detail"
  }
}

if (-not $NoBrowser) {
  $chromeCandidates = @(
    (Get-Command chrome.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1),
    (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe'),
    (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe')
  )
  $chrome = $chromeCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
  if (-not $chrome) { throw "Chrome was not found. Open $url in Chrome." }
  Start-Process -FilePath $chrome -ArgumentList @($url)
}
Write-Host "Recall is running locally at $url"
