@echo off
REM ════════════════════════════════════════════════════════════════════════
REM  INSTALADOR DEL CONECTOR ALEPHIA (un clic, sin administrador)
REM
REM  Envoltorio de doble clic sobre instalar.ps1 (la unica fuente de verdad:
REM  guarda el conector y su lanzadera silenciosa en LOCALAPPDATA\ALEPHIA y
REM  registra alephia:// solo para tu usuario). Si el navegador bloquea este
REM  .bat, el mismo instalador se ejecuta pegando en PowerShell:
REM
REM    irm https://visor-ecd-portal.onrender.com/conector/instalar.ps1 | iex
REM
REM  Para desinstalar:  reg delete "HKCU\Software\Classes\alephia" /f
REM ════════════════════════════════════════════════════════════════════════
echo.
echo  Instalando el Conector ALEPHIA...
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm 'https://visor-ecd-portal.onrender.com/conector/instalar.ps1' | iex"
if errorlevel 1 (
  echo.
  echo  No se pudo instalar. Comprueba tu conexion e intentalo de nuevo.
  echo.
)
pause
