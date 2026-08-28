# ══════════════════════════════════════════════════════════════════════════
# INSTALADOR DEL CONECTOR ALEPHIA (una linea, sin administrador)
#
#   irm https://visor-ecd-portal.onrender.com/conector/instalar.ps1 | iex
#
# Existe porque los navegadores bloquean cada vez mas los .bat descargados.
# Hace lo mismo que el .bat: guarda el conector y su lanzadera silenciosa en
# %LOCALAPPDATA%\ALEPHIA y registra el protocolo alephia:// SOLO para tu
# usuario (HKCU). Desinstalar: Remove-Item HKCU:\Software\Classes\alephia -Recurse
# ══════════════════════════════════════════════════════════════════════════
$ErrorActionPreference = 'Stop'
$portal  = 'https://visor-ecd-portal.onrender.com'
$carpeta = Join-Path $env:LOCALAPPDATA 'ALEPHIA'
New-Item -Force -ItemType Directory $carpeta | Out-Null

$ProgressPreference = 'SilentlyContinue'
Invoke-WebRequest -UseBasicParsing "$portal/conector/conector.ps1" -OutFile (Join-Path $carpeta 'conector.ps1')
Invoke-WebRequest -UseBasicParsing "$portal/conector/conector.vbs" -OutFile (Join-Path $carpeta 'conector.vbs')

$raiz = 'HKCU:\Software\Classes\alephia'
New-Item -Path "$raiz\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path $raiz -Name '(Default)' -Value 'URL:Conector ALEPHIA'
New-ItemProperty -Path $raiz -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
$orden = 'wscript.exe "' + (Join-Path $carpeta 'conector.vbs') + '" "%1"'
Set-ItemProperty -Path "$raiz\shell\open\command" -Name '(Default)' -Value $orden

Write-Host ''
Write-Host '  Conector ALEPHIA instalado.' -ForegroundColor Green
Write-Host '  Vuelve al portal y pulsa "Abrir en el escritorio": el modelo se abrira'
Write-Host '  en Revit / Civil 3D sin ventanas, con avisos en la bandeja.'
Write-Host ''
