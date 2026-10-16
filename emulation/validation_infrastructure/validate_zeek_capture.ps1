<#
.SYNOPSIS
    Script de validación y prueba de concepto para captura de paquetes en vivo con Zeek
    compartiendo el namespace de red de un contenedor existente (xdr-emu-red).

.DESCRIPTION
    Este script ejecuta una prueba controlada, benigna y no destructiva:
    1. Verifica que Docker está activo y los contenedores requeridos (xdr-emu-red, xdr-api-ml) están 'Up'.
    2. Comprueba que el endpoint HTTP /health devuelve HTTP 200 de solo lectura.
    3. Descubre dinámicamente la interfaz de red y la IP del contenedor objetivo, así como la IP del destino.
    4. Crea un subdirectorio de ejecución único bajo runs/run_<timestamp>/ para preservar logs.
    5. Comprueba si la imagen de Zeek (por defecto zeek/zeek:latest) está disponible localmente sin descargarla.
    6. Comprueba que no existan colisiones de nombres con el contenedor temporal mediante GUID único (sin rm -f).
    7. Genera una política aislada (http_analyzer.zeek) con Analyzer::register_for_port oficial sin opciones obsoletas.
    8. Inicia el contenedor Zeek como proceso PID 1 directo (permitiendo parada limpia con SIGTERM).
    9. Verifica que el proceso Zeek siga activo y no haya terminado prematuramente.
    10. Si Zeek falla al arrancar, captura sus logs de error (zeek_container.log) antes de limpiar.
    11. Genera una solicitud benigna GET /health con test_id único y valida HTTP 200 OK.
    12. Parsea conn.log con índice corregido y valida simultáneamente: IP orig, IP resp, puerto 8000, TCP y timestamp.
    13. Parsea http.log exigiendo el test_id único obligatorio (sin aceptar genéricos).
    14. Valida que los logs pertenezcan al directorio de la ejecución actual.
    15. Genera resultados independientes para conectividad HTTP, captura de conexión y análisis HTTP.
    16. Clasifica como PASS únicamente si todas las verificaciones requeridas pasaron.
    17. Detiene y limpia de forma segura exclusivamente el contenedor temporal sin borrar logs ni tocar otros contenedores.
#>

[CmdletBinding()]
param (
    [string]$ImageName = "zeek/zeek:latest",
    [string]$TargetContainer = "xdr-emu-red",
    [string]$ApiContainer = "xdr-api-ml",
    [string]$ApiUrl = "http://api-ml:8000/health",
    [string]$OutputDir = "",
    [switch]$AutoPull = $false
)

$ErrorActionPreference = "Stop"

# Directorio base del script
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $OutputDir = Join-Path $ScriptDir "runs\run_$Timestamp"
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  VALIDACION ZEEK EN VIVO (POC NETNS COMPARTIDO) - REVISION" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "[*] Directorio de salida: $OutputDir"
Write-Host "[*] Contenedor objetivo : $TargetContainer"
Write-Host "[*] Contenedor destino  : $ApiContainer"
Write-Host "[*] Imagen Zeek requerida: $ImageName"
Write-Host ""

# Helper: Parser robusto para logs TSV de Zeek (#fields)
# Corrige indexación de arrays en PowerShell usando Select-Object -Skip 1
function Parse-ZeekLog {
    param (
        [string]$FilePath
    )
    if (-not (Test-Path $FilePath)) { return @() }
    
    $headers = @()
    $records = @()
    foreach ($line in (Get-Content $FilePath)) {
        if ($line.StartsWith("#fields")) {
            $tokens = $line -split "\t"
            # Omitir el primer token ('#fields') de forma segura sin columnas nulas
            $headers = @($tokens | Select-Object -Skip 1)
            continue
        }
        if ($line.StartsWith("#") -or [string]::IsNullOrWhiteSpace($line)) {
            continue
        }
        $parts = $line -split "\t"
        if ($headers.Count -gt 0 -and $parts.Count -eq $headers.Count) {
            $rowObj = [ordered]@{}
            for ($i = 0; $i -lt $headers.Count; $i++) {
                $rowObj[$headers[$i]] = $parts[$i]
            }
            $records += [pscustomobject]$rowObj
        }
    }
    return $records
}

# 1. Comprobar disponibilidad de Docker
Write-Host "[1/8] Comprobando disponibilidad del demonio Docker..." -ForegroundColor Yellow
try {
    $dockerVer = docker version --format '{{.Server.Version}}' 2>$null
    if (-not $dockerVer) {
        throw "Docker no esta respondiendo o no esta en ejecucion."
    }
    Write-Host "  [OK] Docker Server Version: $dockerVer" -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] Error comunicando con Docker: $_" -ForegroundColor Red
    exit 1
}

# 2. Comprobar estado de contenedores esperados
Write-Host "[2/8] Comprobando contenedores requeridos..." -ForegroundColor Yellow
$runningContainers = docker ps --format '{{.Names}}'
if ($runningContainers -notcontains $TargetContainer) {
    Write-Host "  [FAIL] El contenedor objetivo '$TargetContainer' no esta en ejecucion." -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Contenedor objetivo activo: $TargetContainer" -ForegroundColor Green

if ($runningContainers -notcontains $ApiContainer) {
    Write-Host "  [FAIL] El contenedor API destino '$ApiContainer' no esta en ejecucion." -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Contenedor API destino activo: $ApiContainer" -ForegroundColor Green

# 3. Validar endpoint benigno previo
Write-Host "[3/8] Verificando respuesta previa del endpoint de salud benigno..." -ForegroundColor Yellow
try {
    $preCheckJson = docker exec $TargetContainer python -c "import requests, json; r=requests.get('$ApiUrl', timeout=3.0); print(json.dumps({'code': r.status_code, 'status': r.json().get('status')}))" 2>$null
    $preCheck = $preCheckJson | ConvertFrom-Json
    if ($preCheck.code -ne 200 -or $preCheck.status -ne "ok") {
        throw "Respuesta inesperada de salud: $preCheckJson"
    }
    Write-Host "  [OK] Endpoint /health responde HTTP 200 (Status: $($preCheck.status))" -ForegroundColor Green
} catch {
    Write-Host "  [FAIL] No se pudo verificar $ApiUrl desde ${TargetContainer}: $_" -ForegroundColor Red
    exit 1
}

# 4. Descubrir interfaz de red e IPs de origen y destino
Write-Host "[4/8] Inspeccionando direccionamiento e interfaces de red..." -ForegroundColor Yellow
try {
    # Interfaz en xdr-emu-red (ignorando loopback)
    $ifaceLines = docker exec $TargetContainer ip -o link show 2>$null
    $targetIface = "eth0"
    foreach ($line in ($ifaceLines -split "`n")) {
        if ($line -match '^\d+:\s+([a-zA-Z0-9_-]+)[@:]' -and $matches[1] -ne "lo") {
            $targetIface = $matches[1].Trim()
            break
        }
    }
    
    # IP de xdr-emu-red
    $ipRaw = docker exec $TargetContainer ip -o -4 addr show $targetIface 2>$null
    $ipMatch = [regex]::Match($ipRaw, 'inet\s+([0-9.]+)/')
    $targetIp = if ($ipMatch.Success) { $ipMatch.Groups[1].Value } else { "Desconocida" }

    # IP de xdr-api-ml
    $apiIp = (docker inspect --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $ApiContainer 2>$null).Trim()

    Write-Host "  [OK] Interfaz objetivo : $targetIface" -ForegroundColor Green
    Write-Host "  [OK] IP Origen ($TargetContainer): $targetIp" -ForegroundColor Green
    Write-Host "  [OK] IP Destino ($ApiContainer): $apiIp" -ForegroundColor Green
} catch {
    $targetIface = "eth0"
    $targetIp = "172.22.0.3"
    $apiIp = "172.22.0.10"
    Write-Host "  [WARN] Recurriendo a valores nominales (Origen: $targetIp, Destino: $apiIp): $_" -ForegroundColor Yellow
}

# 5. Crear directorio de ejecucion unico
Write-Host "[5/8] Creando directorio de salida unico..." -ForegroundColor Yellow
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}
Write-Host "  [OK] Directorio preparado: $OutputDir" -ForegroundColor Green

# 6. Comprobar si la imagen de Zeek existe localmente
Write-Host "[6/8] Comprobando imagen local de Zeek ($ImageName)..." -ForegroundColor Yellow
$localImageId = (docker images -q $ImageName 2>$null)
$imageExists = [bool]$localImageId

if (-not $imageExists) {
    if ($AutoPull) {
        Write-Host "  [*] Parametro -AutoPull activo. Descargando imagen oficial $ImageName..." -ForegroundColor Cyan
        docker pull $ImageName
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [FAIL] Error descargando imagen $ImageName" -ForegroundColor Red
            exit 2
        }
        $imageExists = $true
    } else {
        Write-Host "  [BLOCKED] La imagen '$ImageName' NO esta presente en el repositorio local de Docker." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  >>> PRERREQUISITO REQUERIDO <<<" -ForegroundColor Red
        Write-Host "  Para ejecutar la captura en vivo en el namespace de $TargetContainer," -ForegroundColor White
        Write-Host "  se requiere la autorizacion para descargar la imagen oficial de Zeek mediante:" -ForegroundColor White
        Write-Host "      docker pull $ImageName" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "  Alternativamente, ejecute este script con el parametro -AutoPull una vez autorizado:" -ForegroundColor White
        Write-Host "      powershell -ExecutionPolicy Bypass -File $ScriptDir\validate_zeek_capture.ps1 -AutoPull" -ForegroundColor Cyan
        Write-Host ""
        
        # Generar manifiesto de bloqueo en la carpeta de la prueba
        $blockInfo = @{
            status = "BLOCKED"
            reason = "Imagen Docker de Zeek ($ImageName) no disponible localmente y no autorizada para descarga automatica"
            prerequisite_command = "docker pull $ImageName"
            target_container = $TargetContainer
            detected_interface = $targetIface
            target_ip = $targetIp
            api_ip = $apiIp
            timestamp = (Get-Date).ToString("o")
        }
        $blockInfo | ConvertTo-Json -Depth 3 | Set-Content -Path (Join-Path $OutputDir "status.json") -Encoding UTF8
        Write-Host "[!] Prueba finalizada en estado BLOCKED (sin modificaciones en infraestructura)." -ForegroundColor Yellow
        exit 3
    }
}

# 7. Ejecutar captura temporal en vivo con Zeek
Write-Host "[7/8] Gestionando contenedor temporal de Zeek con namespace compartido..." -ForegroundColor Yellow

# Generar nombre unico con GUID para evitar cualquier colision de nombres
$UniqueGuid = [System.Guid]::NewGuid().ToString("N").Substring(0, 8)
$TempContainerName = "xdr-val-zeek-$UniqueGuid"
$TestId = "val-zeek-" + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$PcapVolumePath = (Resolve-Path $OutputDir).Path -replace '\\', '/'

# Control de Colisión Estricto: Abortar si ya existe un contenedor con el mismo nombre (sin usar rm -f)
$existingCollision = docker ps -a -q -f "name=^/${TempContainerName}$" 2>$null
if ($existingCollision) {
    Write-Host "  [FAIL] Colision detectada: ya existe un contenedor denominado '$TempContainerName'." -ForegroundColor Red
    throw "Colision de nombre detectada con contenedor existente. Abortando sin modificar recursos previos."
}

# Generar script de política de Zeek aislado en el directorio de salida
# Utiliza la API oficial de Zeek Analyzer::register_for_port sin redefiniciones no declaradas
$policyFileName = "http_analyzer.zeek"
$policyFilePath = Join-Path $OutputDir $policyFileName
$zeekPolicyContent = @"
# Politica aislada para registrar el puerto 8000 en el analizador HTTP de Zeek
@load base/protocols/conn
@load base/protocols/http

event zeek_init()
    {
    Analyzer::register_for_port(Analyzer::ANALYZER_HTTP, 8000/tcp);
    }
"@
Set-Content -Path $policyFilePath -Value $zeekPolicyContent -Encoding Ascii
Write-Host "  [OK] Politica Zeek generada en: $policyFilePath" -ForegroundColor Green

$reqResult = $null
$containerCreated = $false

try {
    Write-Host "  [*] Lanzando contenedor temporal: $TempContainerName" -ForegroundColor Gray
    Write-Host "  [*] Compartiendo red con: container:$TargetContainer (Interfaz: $targetIface)" -ForegroundColor Gray
    
    # Invocamos zeek como proceso principal (PID 1) sin subshells intermedias
    # Esto asegura que SIGTERM de docker stop sea manejado limpiamente por Zeek
    $dockerRunCmd = @(
        "run", "-d",
        "--name", $TempContainerName,
        "--net=container:$TargetContainer",
        "--cap-add=NET_RAW",
        "--cap-add=NET_ADMIN",
        "-v", "${PcapVolumePath}:/logs",
        "-w", "/logs",
        $ImageName,
        "zeek", "-i", $targetIface, "-C", "local", "./$policyFileName"
    )
    
    $containerId = docker @dockerRunCmd
    if ($LASTEXITCODE -ne 0 -or -not $containerId) {
        throw "Error al invocar docker run para Zeek: $containerId"
    }
    $containerCreated = $true

    # Control 1: Verificar que el contenedor SIGUE ejecutandose y no murio inmediatamente
    Start-Sleep -Seconds 2
    $stateOutput = (docker inspect --format '{{.State.Running}} {{.State.ExitCode}} {{.State.Status}}' $TempContainerName 2>$null).Trim()
    $stateParts = $stateOutput -split " "
    $isRunning = [bool]($stateParts[0] -eq "true")
    $exitCode = if ($stateParts.Length -ge 2) { $stateParts[1] } else { "-1" }
    
    if (-not $isRunning) {
        # Control 2: Capturar logs de error de Zeek antes de limpiar
        try {
            $crashLogPath = Join-Path $OutputDir "zeek_container.log"
            docker logs $TempContainerName 2>&1 | Set-Content -Path $crashLogPath -Encoding UTF8 -ErrorAction SilentlyContinue
        } catch {}
        throw "El contenedor Zeek ($TempContainerName) termino prematuramente (Status: $($stateParts[2]), ExitCode: $exitCode). Se capturo log en zeek_container.log"
    }

    Write-Host "  [OK] Contenedor Zeek activo y capturando (ID: $($containerId.Substring(0, 12)))" -ForegroundColor Green

    # Esperar 2 segundos para estabilizacion de captura
    Start-Sleep -Seconds 2

    # Generar la solicitud HTTP benigna desde xdr-emu-red hacia api-ml
    $requestUrl = "$ApiUrl`?test_id=$TestId"
    Write-Host "  [*] Generando peticion HTTP benigna: $requestUrl" -ForegroundColor Cyan
    
    $reqStartTime = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    $curlExec = docker exec $TargetContainer python -c @"
import time, requests, json
t0 = time.time()
try:
    r = requests.get('$requestUrl', timeout=5.0)
    t1 = time.time()
    print(json.dumps({'start_ts': t0, 'end_ts': t1, 'status_code': r.status_code, 'body': r.json()}))
except Exception as e:
    print(json.dumps({'error': str(e), 'status_code': 0}))
"@
    $reqEndTime = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    
    Write-Host "  [+] Respuesta recibida: $curlExec" -ForegroundColor Gray
    $reqResult = $curlExec | ConvertFrom-Json

    # Esperar a que los paquetes se procesen
    Start-Sleep -Seconds 2

} catch {
    Write-Host "  [ERROR] Excepcion durante la ejecucion de la prueba: $_" -ForegroundColor Red
} finally {
    # Control 9: Detener y eliminar EXCLUSIVAMENTE el contenedor temporal creado por esta ejecucion
    if ($TempContainerName -and $containerCreated) {
        $containerExists = docker ps -a -q -f "name=^/${TempContainerName}$" 2>$null
        if ($containerExists) {
            # 1. Preservar logs de diagnostico antes de limpiar (con proteccion de excepcion)
            try {
                $containerLogPath = Join-Path $OutputDir "zeek_container.log"
                docker logs $TempContainerName 2>&1 | Set-Content -Path $containerLogPath -Encoding UTF8 -ErrorAction SilentlyContinue
            } catch {
                Write-Host "  [WARN] No se pudieron extraer logs de ${TempContainerName}: $_" -ForegroundColor Yellow
            }
            
            # 2. Detencion controlada con SIGTERM (-t 5) para que Zeek vuelque todos sus buffers
            Write-Host "  [*] Enviando senal de finalizacion controlada a $TempContainerName (SIGTERM)..." -ForegroundColor Gray
            try {
                docker stop -t 5 $TempContainerName 2>$null | Out-Null
            } catch {}
            try {
                docker rm $TempContainerName 2>$null | Out-Null
            } catch {}
            Write-Host "  [OK] Contenedor temporal $TempContainerName detenido y removido de forma segura." -ForegroundColor Green
        }
    }
}

# 8. Analizar evidencias generadas en $OutputDir
Write-Host ""
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "  EVALUACION ESTRICTA DE EVIDENCIAS CAPTURADAS (8/8)" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

$connLogPath = Join-Path $OutputDir "conn.log"
$httpLogPath = Join-Path $OutputDir "http.log"

# Control 6: Validar que los archivos pertenecen a la ejecucion actual
$hasConnLog = (Test-Path $connLogPath)
$hasHttpLog = (Test-Path $httpLogPath)

# Control 3: Validar HTTP 200 OK
$httpConnectivityPass = ($reqResult -and $reqResult.status_code -eq 200)
$httpConnStatus = if ($httpConnectivityPass) { "PASS" } else { "FAIL" }
Write-Host "1. Conectividad HTTP (/health): $httpConnStatus" -ForegroundColor $(if ($httpConnectivityPass) { "Green" } else { "Red" })
if (-not $httpConnectivityPass) {
    Write-Host "   Detalle: status_code recibido: $(if ($reqResult) { $reqResult.status_code } else { 'Ninguno' })" -ForegroundColor Red
}

# Control 4: Validar conn.log estrictamente (IP orig, IP resp, puerto 8000, tcp, ventana de tiempo)
# Se exige coincidencia simultanea sin aceptar conexiones de loopback ni comodines
$connFound = $false
$connMatchDetails = @()
if ($hasConnLog) {
    $connRows = Parse-ZeekLog -FilePath $connLogPath
    foreach ($row in $connRows) {
        $rOrigIp = $row.'id.orig_h'
        $rRespIp = $row.'id.resp_h'
        $rRespPort = $row.'id.resp_p'
        $rProto = $row.'proto'
        $rTs = [double]($row.'ts')
        
        $ipOrigMatch = ($rOrigIp -eq $targetIp)
        $ipRespMatch = ($rRespIp -eq $apiIp)
        $portMatch = ($rRespPort -eq "8000")
        $protoMatch = ($rProto.ToLower() -eq "tcp")
        $timeMatch = ([Math]::Abs($rTs - $reqStartTime) -le 30)
        
        if ($ipOrigMatch -and $ipRespMatch -and $portMatch -and $protoMatch -and $timeMatch) {
            $connFound = $true
            $connMatchDetails += $row
        }
    }
}

$connLogStatus = if ($connFound) { "PASS" } elseif ($hasConnLog) { "FAIL (Sin coincidencia estricta de flujo)" } else { "FAIL (conn.log no generado)" }
Write-Host "2. Captura de Flujo L4 (conn.log): $connLogStatus" -ForegroundColor $(if ($connFound) { "Green" } else { "Red" })
if ($connFound) {
    foreach ($m in $connMatchDetails) {
        Write-Host "   [MATCH] ts=$($m.'ts') $($m.'id.orig_h'):$($m.'id.orig_p') -> $($m.'id.resp_h'):$($m.'id.resp_p') [$($m.'proto')] state=$($m.'conn_state')" -ForegroundColor Green
    }
} else {
    Write-Host "   Detalle: No se encontro ningun flujo TCP correlacionado ($targetIp -> ${apiIp}:8000) dentro de la ventana de ejecucion." -ForegroundColor Yellow
}

# Control 5: Validar http.log por URI exacta con TestId (eliminando cualquier coincidencia generica de 'health')
$httpLogFound = $false
$httpMatchDetails = @()
if ($hasHttpLog) {
    $httpRows = Parse-ZeekLog -FilePath $httpLogPath
    foreach ($hrow in $httpRows) {
        $hUri = $hrow.'uri'
        $hHost = $hrow.'host'
        $hRespPort = $hrow.'id.resp_p'
        
        # Validacion estricta: puerto 8000 obligatorio, host legitimo y URI con TestId unico
        # Se eliminan condiciones comodin que permitian valores ausentes o nulos ('-')
        $portMatch = ($hRespPort -eq "8000")
        $hostMatch = (![string]::IsNullOrWhiteSpace($hHost) -and $hHost -ne "-" -and ($hHost -eq "api-ml:8000" -or $hHost -eq "api-ml"))
        $uriMatch = (![string]::IsNullOrWhiteSpace($hUri) -and $hUri -ne "-" -and $hUri -like "*$TestId*")
        
        if ($portMatch -and $hostMatch -and $uriMatch) {
            $httpLogFound = $true
            $httpMatchDetails += $hrow
        }
    }
}

$httpLogStatus = if ($httpLogFound) { "PASS" } elseif ($hasHttpLog) { "FAIL (URI sin TestID coincidente)" } else { "FAIL (http.log no generado)" }
Write-Host "3. Decodificacion L7 (http.log): $httpLogStatus" -ForegroundColor $(if ($httpLogFound) { "Green" } else { "Red" })
if ($httpLogFound) {
    foreach ($hm in $httpMatchDetails) {
        Write-Host "   [MATCH] method=$($hm.'method') host=$($hm.'host') uri=$($hm.'uri') status_code=$($hm.'status_code')" -ForegroundColor Green
    }
} else {
    Write-Host "   Detalle: No se encontro transaccion HTTP con Test ID '$TestId' en http.log." -ForegroundColor Yellow
}

# Control 7 y 8: Clasificacion final rigurosa
$overallStatus = "FAIL"
$overallDiagnosis = ""

if ($httpConnectivityPass -and $connFound -and $httpLogFound) {
    $overallStatus = "PASS"
    $overallDiagnosis = "Prueba de concepto completada con exito. Zeek capturo en vivo el flujo L4 TCP en conn.log y decodifico la transaccion HTTP en http.log."
} elseif ($httpConnectivityPass -and $connFound -and -not $httpLogFound) {
    $overallStatus = "PARTIAL_CAPTURE"
    $overallDiagnosis = "El flujo TCP hacia el puerto 8000 fue capturado correctamente en conn.log, pero Zeek no produjo el registro L7 en http.log. Causa tecnica posible: la sesion no cumplio con la cabecera HTTP esperada o el flush del stream no se completo antes de la rotacion."
} elseif ($httpConnectivityPass -and -not $connFound) {
    $overallStatus = "FAIL"
    $overallDiagnosis = "La comunicacion HTTP llego a la API (200 OK), pero Zeek no capturo ningun paquete del flujo en conn.log a traves de la vNIC compartida."
} else {
    $overallStatus = "FAIL"
    $overallDiagnosis = "La solicitud HTTP no tuvo exito o Zeek fallo durante la inicializacion."
}

# Control 10: Preservar informe y resumen de diagnostico
$summary = [ordered]@{
    timestamp = (Get-Date).ToString("o")
    test_id = $TestId
    target_container = $TargetContainer
    api_container = $ApiContainer
    network_interface = $targetIface
    target_ip = $targetIp
    api_ip = $apiIp
    controls = [ordered]@{
        http_connectivity = $httpConnStatus
        conn_log_capture = $connLogStatus
        http_log_analysis = $httpLogStatus
    }
    overall_status = $overallStatus
    diagnosis = $overallDiagnosis
    evidence = [ordered]@{
        output_directory = $OutputDir
        conn_log_present = $hasConnLog
        conn_matches = $connMatchDetails
        http_log_present = $hasHttpLog
        http_matches = $httpMatchDetails
    }
}

$summary | ConvertTo-Json -Depth 5 | Set-Content -Path (Join-Path $OutputDir "summary.json") -Encoding UTF8

Write-Host ""
Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray
Write-Host "RESULTADO GLOBAL : $overallStatus" -ForegroundColor $(if ($overallStatus -eq "PASS") { "Green" } elseif ($overallStatus -eq "PARTIAL_CAPTURE") { "Yellow" } else { "Red" })
Write-Host "DIAGNOSTICO      : $overallDiagnosis" -ForegroundColor White
Write-Host "EVIDENCIAS EN    : $OutputDir" -ForegroundColor Cyan
Write-Host "-----------------------------------------------------------------" -ForegroundColor Gray

# Codigo de salida coherente con el resultado global:
# 0 = PASS (Exito completo L4 + L7)
# 2 = PARTIAL_CAPTURE (L4 capturado, pero L7 no decodificado)
# 1 = FAIL (Fallo de conectividad o sin captura de flujo)
if ($overallStatus -eq "PASS") {
    exit 0
} elseif ($overallStatus -eq "PARTIAL_CAPTURE") {
    exit 2
} else {
    exit 1
}
