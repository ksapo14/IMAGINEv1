$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$python = Join-Path $root "backend\.venv\Scripts\python.exe"
$next = Join-Path $root "node_modules\.bin\next.cmd"

if (-not (Test-Path $python)) {
  Write-Error "Backend virtual environment not found. Run: python -m venv backend/.venv; backend\.venv\Scripts\python -m pip install -r backend\requirements.txt"
}

Set-Location $root

function Free-Port {
  param([int]$port, [string]$expectedProcessName)
  try {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
      $procId = $conn[0].OwningProcess
      $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
      if ($proc) {
        if (-not $expectedProcessName -or $proc.ProcessName -like "*$expectedProcessName*") {
          Write-Host "Port $port is occupied by '$($proc.ProcessName)' (PID: $procId). Terminating to free the port..." -ForegroundColor Yellow
          taskkill /PID $procId /T /F | Out-Null
          Start-Sleep -Milliseconds 500
        }
      }
    }
  } catch {
    # Ignore any querying or access errors
  }
}

Free-Port -port 8010 -expectedProcessName "python"
Free-Port -port 3000 -expectedProcessName "node"

# Start the AI backend first so the frontend can submit teacher input immediately.
$backend = Start-Process `
  -FilePath $python `
  -ArgumentList @("-m", "uvicorn", "backend.main:app", "--reload", "--port", "8010", "--env-file", ".env") `
  -WorkingDirectory $root `
  -PassThru `
  -NoNewWindow

try {
  Write-Host "Backend:  http://127.0.0.1:8010"
  Write-Host "Frontend: http://localhost:3000"
  Write-Host "Press Ctrl+C to stop the dev stack."

  # Keep Next.js in the foreground so npm run dev behaves like a normal dev server.
  & $next dev
}
finally {
  if ($backend -and -not $backend.HasExited) {
    taskkill /PID $backend.Id /T /F | Out-Null
  }
}
