# Quick start script

Write-Host "=== Starting Fresh Instance ===" -ForegroundColor Green

# Stop all node processes
Write-Host "`n1. Stopping all Node.js processes..." -ForegroundColor Yellow
try {
    taskkill /f /im node.exe 2>$null
    Write-Host "✅ Processes stopped" -ForegroundColor Green
} catch {
    Write-Host "No processes to stop" -ForegroundColor Gray
}

Start-Sleep -Seconds 2

# Start the application
Write-Host "`n2. Starting application..." -ForegroundColor Yellow
cd insurance-chat\backend
npm run start:dev

