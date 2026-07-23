@echo off
chcp 65001 >nul
echo ============================================
echo   ECD Link - Instalador (Revit 2023)
echo ============================================
echo.

set "ADDINS=%AppData%\Autodesk\Revit\Addins\2023"

if not exist "%ADDINS%" (
    echo [X] No se encontro la carpeta de Addins de Revit 2023:
    echo     %ADDINS%
    echo     ^(Este equipo tiene Revit 2023 instalado?^)
    echo.
    pause
    exit /b 1
)

mkdir "%ADDINS%\ECDLink" 2>nul
copy /Y "%~dp0ECDLink.dll" "%ADDINS%\ECDLink\ECDLink.dll" >nul
if errorlevel 1 (
    echo [X] No se pudo copiar la DLL. Cierra Revit e intenta de nuevo.
    pause
    exit /b 1
)
copy /Y "%~dp0ECDLink.addin" "%ADDINS%\ECDLink.addin" >nul

rem Config inicial apuntando al servidor de produccion (solo si no existe ya)
set "CFGDIR=%AppData%\ECDLink"
if not exist "%CFGDIR%\config.json" (
    mkdir "%CFGDIR%" 2>nul
    (
        echo backendUrl=https://visor-ecd-backend.onrender.com
        echo project=
        echo token=
    ) > "%CFGDIR%\config.json"
)

echo [OK] ECD Link instalado.
echo.
echo Siguiente paso:
echo   1. Abre Revit 2023 ^(si estaba abierto, cierralo y vuelve a abrir^)
echo   2. Acepta "Cargar siempre" cuando Revit pregunte por ECD Link
echo   3. Pestana ECD  -^>  boton "Vincular con ECD"
echo   4. Indica el FRENTE ^(mismo codigo que en la web^) y Vincular
echo.
pause
