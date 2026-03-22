$target = "d:\VISOR_APS_TL\frontend-docs\src\App.jsx"
$bridge = "d:\VISOR_APS_TL\frontend-docs\src\bridge.txt"
$temp = "d:\VISOR_APS_TL\frontend-docs\src\App.jsx.temp"

# Read part 1 (Header up to line 503)
$p1 = Get-Content $target -TotalCount 503

# Read middle part (repaired components)
$p2 = Get-Content $bridge

# Read part 3 (Footer from original FolderNode start, skip 840)
# Note: In the CURRENT corrupted file, FolderNode is at 899. 
# But wait, I need to skip up to where the "real" FolderNode begins.
# Line 899 in CURRENT file is "function FolderNode...". 
# So I skip 898 lines of the CURRENT file to get the correct footer.
$p3 = Get-Content $target | Select-Object -Skip 898

# Concatenate and save
$all = $p1 + $p2 + $p3
$all | Set-Content -Path $temp -Encoding UTF8

# Replace original
Move-Item -Path $temp -Destination $target -Force
