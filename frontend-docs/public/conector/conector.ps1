# ══════════════════════════════════════════════════════════════════════════
# CONECTOR ALEPHIA · abre documentos del ECD en el software del escritorio
#
# El navegador no puede lanzar Revit ni Civil 3D: este script es el puente.
# El portal invoca  alephia://abrir?u=<url-firmada>&n=<nombre.rvt>  y aqui:
#   1. se valida que la URL venga del almacen del ECD (y de nadie mas),
#   2. se descarga el original a Descargas\ALEPHIA con su nombre real,
#   3. se abre: Windows lo lleva a la aplicacion asociada (Revit, Civil 3D,
#      Navisworks, AutoCAD...).
#
# El protocolo lo puede invocar cualquier pagina web -- por eso la lista de
# dominios permitidos: este script NO es un descargador universal.
# ══════════════════════════════════════════════════════════════════════════
param([string]$Uri)
$ErrorActionPreference = 'Stop'
try {
  if (-not $Uri) { exit }
  $u = [uri]$Uri
  if ($u.Scheme -ne 'alephia') { exit }

  $q = @{}
  foreach ($par in ($u.Query.TrimStart('?') -split '&')) {
    $kv = $par -split '=', 2
    if ($kv.Count -eq 2) { $q[$kv[0]] = [uri]::UnescapeDataString($kv[1]) }
  }
  $url = $q['u']; $nombre = $q['n']
  if (-not $url -or -not $nombre) { exit }

  $anfitrion = ([uri]$url).Host
  $permitidos = @('storage.googleapis.com', 'visor-ecd-backend.onrender.com', 'api.alephia.com.pe')
  if ($permitidos -notcontains $anfitrion) { exit }

  $nombre  = ($nombre -replace '[\\/:*?"<>|]', '_')
  $carpeta = Join-Path $env:USERPROFILE 'Downloads\ALEPHIA'
  New-Item -Force -ItemType Directory $carpeta | Out-Null
  $fichero = Join-Path $carpeta $nombre

  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $fichero
  Invoke-Item $fichero
} catch {
  # Silencio deliberado: si algo falla, el portal ya ofrece la descarga normal.
}
