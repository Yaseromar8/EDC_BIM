@echo off
chcp 65001 >nul
echo ECD Link - Desinstalador
echo.
set "ADDINS=%AppData%\Autodesk\Revit\Addins\2023"
del /Q "%ADDINS%\ECDLink.addin" 2>nul
rmdir /S /Q "%ADDINS%\ECDLink" 2>nul
echo [OK] ECD Link desinstalado. (La configuracion en %%AppData%%\ECDLink se conserva.)
echo Cierra y vuelve a abrir Revit para que desaparezca la pestana ECD.
echo.
pause
