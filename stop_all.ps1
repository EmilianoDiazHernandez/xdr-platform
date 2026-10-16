# ==========================================================
# stop_all.ps1 - Detiene Todo el Entorno XDR + Cyber Range
# ==========================================================
Write-Host "==========================================================" -ForegroundColor Yellow
Write-Host "   Deteniendo Todo el Entorno XDR y Cyber Range           " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Yellow

Write-Host "`n[1/2] Deteniendo Cyber Range (Red Corporativa)..." -ForegroundColor Gray
docker compose -f .\emulation\topologias\red-corporativa-base\docker-compose.yml down

Write-Host "`n[2/2] Deteniendo Plataforma XDR..." -ForegroundColor Gray
docker compose down

Write-Host "`n[OK] Todos los servicios detenidos limpiamente." -ForegroundColor Green
