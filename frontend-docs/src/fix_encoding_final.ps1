$path = "d:\VISOR_APS_TL\frontend-docs\src\App.jsx"
$content = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

# Map for broken character sequences (Common artifacts)
$replacements = @{
    "Ã°Å¸â€œâ€¢" = "📘"
    "Ã°Å¸â€œËœ" = "📗"
    "Ã°Å¸â€œâ€”" = "📊"
    "Ã°Å¸â€œÅ " = "🔢"
    "Ã°Å¸â€“Â¼Ã¯Â¸Â" = "🖼️"
    "Ã°Å¸Å½Â¨" = "🎨"
    "Ã°Å¸â€œâ„¢" = "📒"
    "Ã°Å¸â€œâ€ž" = "📄"
    "Ã°Å¸â€œÂ" = "📐"
    "Ã°Å¸Â â€”Ã¯Â¸Â" = "🏗️"
    "Ã°Å¸â€œÂ¦" = "📦"
    "Ã°Å¸Å½Â¬" = "🎬"
    "Ã°Å¸Å½Âµ" = "🎵"
    "Ã¢â€ â€˜" = "↓"
    "Ã³" = "ó"
    "Ã©" = "é"
    "Ã¡" = "á"
    "Ãº" = "ú"
    "Ã±" = "ñ"
    "Ã" = "í" # Note: í is often the lonely Ã in these contexts
    "Â¿" = "¿"
    "Ã¡" = "á"
}

foreach ($key in $replacements.Keys) {
    if ($content.Contains($key)) {
        $content = $content.Replace($key, $replacements[$key])
    }
}

# Final touch for specific UI strings that might still be broken
$content = $content.Replace("QuÃ©", "Qué")
$content = $content.Replace("DescripciÃ³n", "Descripción")
$content = $content.Replace("VersiÃ³n", "Versión")
$content = $content.Replace("TamaÃ±o", "Tamaño")
$content = $content.Replace("AÃ±adir", "Añadir")
$content = $content.Replace("InvitaciÃ³n", "Invitación")
$content = $content.Replace("RevisiÃ³n", "Revisión")
$content = $content.Replace("Últ. actualizaciÃ³n", "Últ. actualización")

[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))
