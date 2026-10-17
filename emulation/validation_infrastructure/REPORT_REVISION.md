# Informe de Revisión y Corrección de Inicialización Zeek (Fase 2)

**Fecha:** 2026-10-13  
**Rama:** `test/integration-api`  
**Objetivo:** Diagnosticar y corregir el fallo de inicialización de Zeek 9.0.0 (`redef used but not previously defined (Log::default_unbuffered)`), reparar el error de indexación en el parser TSV y endurecer la lógica de correlación estricta en [`validate_zeek_capture.ps1`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/emulation/validation_infrastructure/validate_zeek_capture.ps1).

---

## 1. Diagnóstico de la Causa Raíz del Fallo de Zeek

### Error Observado
```text
error in <command line>, line 1: "redef" used but not previously defined (Log::default_unbuffered)
```
Contenedor afectado: `xdr-val-zeek-c81f78d8` (Imagen: `zeek/zeek:latest`, correspondiente a **Zeek v9.0.0**).

### Causa Técnica
1. **Opción Inexistente / Obsoleta**: `Log::default_unbuffered` fue un identificador histórico en versiones antiguas de Zeek / Bro que **no existe** en el framework de logging de Zeek 9.0.0. En Zeek moderno, el vaciado de buffers de logs a disco se gestiona de manera automática al recibir señales de terminación del proceso (`SIGTERM` / `SIGINT`).
2. **Evaluación Prematura en Línea de Comandos**: La opción `-e "redef ..."` se evalúa antes de que los módulos correspondientes estén completamente cargados en el scope léxico, provocando un error de sintaxis fatal que finaliza el contenedor en el segundo cero.

### Solución Implementada
1. **Eliminación de Opciones No Declaradas**: Se removió completamente la referencia a `Log::default_unbuffered`.
2. **Política Aislada con API Oficial**: En lugar de inyectar código frágil en `-e`, el script genera un archivo de política dedicado ([`http_analyzer.zeek`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/emulation/validation_infrastructure/runs/)) en el directorio de salida de la corrida actual, utilizando la API oficial de Zeek:
   ```zeek
   @load base/protocols/conn
   @load base/protocols/http

   event zeek_init()
       {
       Analyzer::register_for_port(Analyzer::ANALYZER_HTTP, 8000/tcp);
       }
   ```
3. **Proceso Principal PID 1 y Manejo de Señales**:
   - Zeek se invoca directamente como ejecutable principal del contenedor:
     `zeek -i $targetIface -C local ./http_analyzer.zeek`
   - Esto garantiza que `zeek` sea PID 1 dentro del contenedor.
   - Al ejecutar `docker stop -t 5`, Docker envía `SIGTERM` directamente a Zeek, el cual ejecuta `zeek_done()`, vacía todos los buffers de red a disco y escribe los archivos `conn.log` y `http.log` sin dejar procesos hijos huérfanos.

---

## 2. Corrección del Parser TSV (`Parse-ZeekLog`)

### Error Detectado
En la implementación anterior:
```powershell
$headers = ($line -split "\t")[1..($line -split "\t").Length]
```
En PowerShell, los arrays son indexados desde `0` hasta `N - 1`. Al solicitar el rango `1..Length`, el índice `Length` está fuera de límites, lo que provocaba que PowerShell agregara un elemento `$null` al final del array `$headers`.
- Consecuencia: `$headers.Count` era igual a `N`, mientras que `$parts.Count` en las líneas de datos era `N - 1`.
- La condición `$headers.Count -eq $parts.Count` evaluaba siempre como `false`, haciendo que ningún registro fuese devuelto por el parser.

### Corrección Aplicada
Se corrigió mediante el operador idiomático de PowerShell `Select-Object -Skip 1`:
```powershell
if ($line.StartsWith("#fields")) {
    $tokens = $line -split "\t"
    $headers = @($tokens | Select-Object -Skip 1)
    continue
}
```
Esto omite exactamente la cabecera `#fields` sin introducir columnas nulas ni desbordar el array.

### Prueba Unitaria Aislada ([`test_parser.ps1`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/emulation/validation_infrastructure/test_parser.ps1))
Se construyó una suite de pruebas unitarias que valida:
- **Test 1**: Parser de `conn.log` (3 registros, 12 columnas exactas, 0 valores nulos) $\rightarrow$ **PASS**.
- **Test 2**: Correlación estricta de `conn.log` $\rightarrow$ **PASS**.
- **Test 3**: Correlación estricta de `http.log` $\rightarrow$ **PASS**.

---

## 3. Endurecimiento de la Lógica de Correlación

### A. Correlación Estricta de `conn.log`
Se eliminó la aceptación de direcciones de loopback (`127.0.0.1`) y la coincidencia disyuntiva (`-or`). Ahora se exige el cumplimiento **simultáneo** de las 5 condiciones:
1. `id.orig_h == $targetIp` (IP real de `xdr-emu-red`: `172.22.0.3`).
2. `id.resp_h == $apiIp` (IP real de `xdr-api-ml`: `172.22.0.10`).
3. `id.resp_p == "8000"`.
4. `proto == "tcp"`.
5. `|ts - reqStartTime| <= 30` (ventana de tiempo estricta).

### B. Correlación Estricta de `http.log`
Se eliminaron todas las condiciones disyuntivas o de comodín que permitían aceptar campos ausentes o nulos (`-` o `$null`). Ahora se exige la coincidencia **simultánea y obligatoria** de:
1. `id.resp_p == "8000"` (puerto de destino obligatorio; no se admiten valores nulos ni puertos alternativos como 80 u 8080).
2. `host` no nulo, distinto de `"-"` y coincidente con `api-ml:8000` o `api-ml` (cabecera HTTP Host enviada por el cliente).
3. `uri` no nula, distinta de `"-"` y con coincidencia de subcadena con el identificador único `test_id` de la corrida actual (`val-zeek-<timestamp>`).

### C. Batería de Pruebas Unitarias de Casos Negativos ([`test_parser.ps1`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/emulation/validation_infrastructure/test_parser.ps1))
Se expandió la suite de pruebas automatizadas para evaluar tanto 2 casos válidos como 5 casos negativos específicos, verificando que **ninguno** de ellos produzca un falso positivo:
1. **Caso Válido 1**: Host `api-ml:8000`, puerto `8000`, URI con `test_id` $\rightarrow$ **Aceptado (PASS)**.
2. **Caso Válido 2**: Host `api-ml`, puerto `8000`, URI con `test_id` $\rightarrow$ **Aceptado (PASS)**.
3. **Caso Negativo 1 (Falta puerto)**: `id.resp_p = "-"` $\rightarrow$ **Rechazado (PASS)**.
4. **Caso Negativo 2 (Falta host)**: `host = "-"` $\rightarrow$ **Rechazado (PASS)**.
5. **Caso Negativo 3 (Puerto incorrecto)**: `id.resp_p = "8080"` $\rightarrow$ **Rechazado (PASS)**.
6. **Caso Negativo 4 (Host incorrecto)**: `host = "evil-domain.com:8000"` $\rightarrow$ **Rechazado (PASS)**.
7. **Caso Negativo 5 (URI sin TestID)**: `uri = "/health"` $\rightarrow$ **Rechazado (PASS)**.
8. **Prueba en Lote Global**: De un conjunto mixto de 7 registros, solo se capturan exactamente los 2 válidos (0 falsos positivos).
9. **Prueba de Codificación de Política**: Verificación binaria de que [`http_analyzer.zeek`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/emulation/validation_infrastructure/validate_zeek_capture.ps1#L228-L241) se genera en ASCII puro sin UTF-8 BOM (`\xef\xbb\xbf`), garantizando compatibilidad con el analizador léxico de Zeek 9.0.0.

---

## 4. Coherencia en Códigos de Salida y Preservación de Evidencias

El script [`validate_zeek_capture.ps1`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/emulation/validation_infrastructure/validate_zeek_capture.ps1) asegura que **siempre se guarden primero las evidencias y los manifiestos de estado** antes de retornar el control al shell:
1. En caso de **bloqueo por imagen no disponible** (`BLOCKED`):
   - Se escribe [`status.json`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/emulation/validation_infrastructure/runs/) con el diagnóstico y el comando de prerrequisito.
   - El script finaliza con **código de salida 3** (distinto de cero).
2. En caso de **finalización de captura**:
   - Se guardan los logs en bruto (`conn.log`, `http.log`, `zeek_container.log`).
   - Se serializa el reporte consolidado [`summary.json`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/emulation/validation_infrastructure/runs/) con el desglose de los 3 controles.
   - Se evalúa el estado global y se devuelve un código coherente:
     - **0**: `PASS` (flujo L4 y transacción L7 capturados y correlacionados al 100%).
     - **2**: `PARTIAL_CAPTURE` (flujo TCP capturado en `conn.log`, pero `http.log` no decodificado).
     - **1**: `FAIL` (fallo de conectividad o sin captura de paquetes).

---

## 5. Inspección y Limpieza Segura de Contenedores Residuales

Durante ejecuciones de prueba previas puede haber quedado un contenedor detenido en estado `Exited (1)`. Específicamente, en el sistema se identificó el contenedor:
- Nombre: `xdr-val-zeek-350dae52` (ID: `02d4514aa317`)
- Imagen: `zeek/zeek:latest`
- Estado: `Exited (1)` con causa diagnosticada: `"redef" used but not previously defined (Log::default_unbuffered)`.

*(Nota: Si en algún entorno el contenedor se hubiera nombrado `xdr-val-zeek-c81f78d8`, el procedimiento aplica de forma idéntica).*

### Protocolo No Destructivo para Inspección y Limpieza

> [!CAUTION]
> **No utilizar comandos destructivos masivos** como `docker rm -f $(docker ps -aq)` o `docker system prune`, ya que destruirían los contenedores activos de la plataforma XDR (`xdr-emu-red`, `xdr-api-ml`, bases de datos, etc.).

#### Paso 1: Inspeccionar si existe algún contenedor temporal residual
```powershell
docker ps -a -f "name=xdr-val-zeek"
```

#### Paso 2: Extraer y preservar los logs de error del contenedor antes de removerlo
```powershell
docker logs xdr-val-zeek-350dae52 > emulation\validation_infrastructure\residual_zeek_350dae52.log
```
*(O sustituir por `xdr-val-zeek-c81f78d8` si ese fuera el contenedor presente).*

#### Paso 3: Eliminar de forma quirúrgica ÚNICAMENTE el contenedor residual identificado
```powershell
docker rm xdr-val-zeek-350dae52
```

#### Paso 4: Confirmar que la plataforma XDR permanece intacta
```powershell
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

---

## 6. Instrucciones para la Ejecución Manual Definitiva

Una vez limpio el contenedor residual previo y con la imagen `zeek/zeek:latest` disponible localmente:

```powershell
powershell -ExecutionPolicy Bypass -File emulation\validation_infrastructure\validate_zeek_capture.ps1
```

### Flujo de Verificación Automática del Script:
1. Comprueba conectividad con Docker Server y presencia de `xdr-emu-red` y `xdr-api-ml`.
2. Verifica respuesta `200 OK` en endpoint `/health`.
3. Descubre dinámicamente interfaz `eth0`, IP origen `172.22.0.3` e IP destino `172.22.0.10`.
4. Genera [`http_analyzer.zeek`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/emulation/validation_infrastructure/runs/) en ASCII sin BOM.
5. Lanza contenedor temporal `xdr-val-zeek-<guid>` con `--net=container:xdr-emu-red` y capacidades mínimas (`NET_RAW`, `NET_ADMIN`).
6. Verifica que el proceso Zeek está corriendo (`liveness check`).
7. Emite petición HTTP benigna con `test_id` único hacia `api-ml:8000`.
8. Detiene ordenadamente el sniffer con `docker stop -t 5` (permitiendo volcado a disco).
9. Analiza `conn.log` y `http.log` mediante parseo estricto TSV.
10. Remueve el contenedor temporal de forma segura en bloque `finally`.
11. Genera [`summary.json`](file:///C:/Users/spide/Documents/IPN/TT/xdr_v2/xdr-platform/emulation/validation_infrastructure/runs/) y retorna código de salida coherente (`0` para PASS).

