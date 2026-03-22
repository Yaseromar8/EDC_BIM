$path = "d:\VISOR_APS_TL\frontend-docs\src\App.jsx"
$content = [System.IO.File]::ReadAllText($path)

# Fix doubled newlines (replace double CRLF with single CRLF)
$fixedContent = $content -replace "\r\n\r\n", "`r`n"

# Repeat once more just in case there were triple newlines
$fixedContent = $fixedContent -replace "\r\n\r\n", "`r`n"

# Save with UTF8 (No BOM) or as requested
[System.IO.File]::WriteAllText($path, $fixedContent, [System.Text.Encoding]::UTF8)
