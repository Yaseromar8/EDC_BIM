# ══════════════════════════════════════════════════════════════════════════
# CONECTOR ALEPHIA · abre documentos del ECD en el software del escritorio
#
# El navegador no puede lanzar Revit ni Civil 3D: este script es el puente.
# El portal invoca  alephia://abrir?u=<url-firmada>&n=<nombre>&v=<version>
# y aqui:
#   1. se valida que la URL venga del almacen del ECD (y de nadie mas),
#   2. si la copia local ya es ESA version, se abre al instante sin red,
#   3. si no, se descarga a Descargas\ALEPHIA con su nombre real y se abre:
#      Windows lo lleva a la aplicacion asociada (Revit, Civil 3D, ...).
#
# Corre SIN VENTANA (lo lanza conector.vbs con estilo oculto): su unica voz
# son los avisos de la bandeja del sistema. Y se AUTO-ACTUALIZA al terminar,
# asi que instalar se hace UNA vez.
#
# El protocolo lo puede invocar cualquier pagina web -- por eso la lista de
# dominios permitidos: este script NO es un descargador universal.
# ══════════════════════════════════════════════════════════════════════════
param([string]$Uri)
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue
$script:bandeja = $null
function Aviso([string]$texto) {
  # Globo en la bandeja: la unica voz del conector ahora que no hay ventana.
  try {
    if (-not $script:bandeja) {
      $script:bandeja = New-Object System.Windows.Forms.NotifyIcon
      $script:bandeja.Icon = [System.Drawing.SystemIcons]::Information
      $script:bandeja.Visible = $true
    }
    $script:bandeja.ShowBalloonTip(3500, 'ALEPHIA', $texto, [System.Windows.Forms.ToolTipIcon]::Info)
  } catch {}
}

try {
  if (-not $Uri) { exit }
  $u = [uri]$Uri
  if ($u.Scheme -ne 'alephia') { exit }

  $q = @{}
  foreach ($par in ($u.Query.TrimStart('?') -split '&')) {
    $kv = $par -split '=', 2
    if ($kv.Count -eq 2) { $q[$kv[0]] = [uri]::UnescapeDataString($kv[1]) }
  }
  $url = $q['u']; $nombre = $q['n']; $version = $q['v']
  if (-not $url -or -not $nombre) { exit }

  $anfitrion = ([uri]$url).Host
  $permitidos = @('storage.googleapis.com', 'visor-ecd-backend.onrender.com', 'api.alephia.com.pe')
  if ($permitidos -notcontains $anfitrion) { exit }

  $nombre  = ($nombre -replace '[\\/:*?"<>|]', '_')
  # La cache vive en datos de aplicacion, NO en Descargas. El dueno vio la
  # carpeta ALEPHIA en sus Descargas y pregunto si era normal: no debia serlo.
  # Una copia visible invita a editarla creyendo que sincroniza -- y no
  # sincroniza: el camino de vuelta al expediente es resubir por el portal.
  # Quien quiera el fichero EN SUS MANOS tiene "Solo descargar el archivo".
  # (ACC hace lo mismo: la cache del Desktop Connector vive escondida.)
  $carpeta = Join-Path $env:LOCALAPPDATA 'ALEPHIA\cache'
  New-Item -Force -ItemType Directory $carpeta | Out-Null
  $fichero = Join-Path $carpeta $nombre

  # La cache no crece sin fin: lo que lleve 45 dias sin abrirse, fuera.
  try {
    Get-ChildItem $carpeta -File | Where-Object {
      $_.LastWriteTime -lt (Get-Date).AddDays(-45)
    } | Remove-Item -Force -ErrorAction SilentlyContinue
  } catch {}

  # CACHE POR VERSION, como el Desktop Connector de ACC: mismo plano cien
  # veces = UNA descarga; solo una version nueva en el ECD vuelve a bajar.
  $sello = "$fichero.version.txt"
  $alDia = $false
  if ($version -and (Test-Path $fichero) -and (Test-Path $sello)) {
    $selloActual = (Get-Content $sello -Raw -ErrorAction SilentlyContinue)
    if ($selloActual -and $selloActual.Trim() -eq $version) { $alDia = $true }
  }

  if ($alDia) {
    # Abrir desde cache cuenta como uso: que la limpieza de 45 dias no se
    # lleve justo los planos que alguien abre a diario.
    try { (Get-Item $fichero).LastWriteTime = Get-Date } catch {}
    Aviso "Abriendo $nombre (copia local al dia)"
  } else {
    Aviso "Descargando $nombre..."
    # La barra de progreso de PowerShell 5 ralentiza la descarga 5-10x:
    # silenciarla es la diferencia entre segundos y medio minuto.
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $fichero
    if ($version) { Set-Content -Path $sello -Value $version -Encoding utf8 }
    Aviso "Abriendo $nombre"
  }

  Invoke-Item $fichero

  # AUTO-ACTUALIZACION: el proximo uso ya corre la ultima version publicada
  # del conector. Instalar, por tanto, se hace UNA sola vez.
  try {
    $propio = Join-Path $env:LOCALAPPDATA 'ALEPHIA\conector.ps1'
    Invoke-WebRequest -UseBasicParsing 'https://visor-ecd-portal.onrender.com/conector/conector.ps1' -OutFile $propio
  } catch {}

  # El globo necesita vivir unos segundos antes de soltar el icono.
  if ($script:bandeja) { Start-Sleep -Seconds 4; $script:bandeja.Dispose() }
} catch {
  Aviso 'No se pudo abrir el documento. Usa la descarga normal del portal.'
  if ($script:bandeja) { Start-Sleep -Seconds 4; $script:bandeja.Dispose() }
}
