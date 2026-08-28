@echo off
REM ════════════════════════════════════════════════════════════════════════
REM  INSTALADOR DEL CONECTOR ALEPHIA (un clic, sin administrador)
REM
REM  Registra el protocolo alephia:// SOLO para tu usuario (HKCU) y guarda
REM  el conector en %LOCALAPPDATA%\ALEPHIA. Desde entonces, el boton
REM  "Abrir en el escritorio" del portal abre los RVT/DWG directamente en
REM  Revit / Civil 3D / la aplicacion asociada.
REM
REM  Para desinstalar:  reg delete "HKCU\Software\Classes\alephia" /f
REM ════════════════════════════════════════════════════════════════════════
echo.
echo  Instalando el Conector ALEPHIA...
powershell -NoProfile -ExecutionPolicy Bypass -Command "New-Item -Force -ItemType Directory \"$env:LOCALAPPDATA\ALEPHIA\" | Out-Null; Invoke-WebRequest -UseBasicParsing 'https://visor-ecd-portal.onrender.com/conector/conector.ps1' -OutFile \"$env:LOCALAPPDATA\ALEPHIA\conector.ps1\""
if errorlevel 1 goto :error

reg add "HKCU\Software\Classes\alephia" /ve /t REG_SZ /d "URL:Conector ALEPHIA" /f >nul
reg add "HKCU\Software\Classes\alephia" /v "URL Protocol" /t REG_SZ /d "" /f >nul
reg add "HKCU\Software\Classes\alephia\shell\open\command" /ve /t REG_SZ /d "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%LOCALAPPDATA%\ALEPHIA\conector.ps1\" \"%%1\"" /f >nul
if errorlevel 1 goto :error

echo.
echo  Listo. Vuelve al portal y pulsa "Abrir en el escritorio":
echo  el modelo se abrira en Revit / Civil 3D / la aplicacion asociada.
echo.
pause
exit /b 0

:error
echo.
echo  No se pudo instalar. Comprueba tu conexion e intentalo de nuevo.
echo.
pause
exit /b 1
