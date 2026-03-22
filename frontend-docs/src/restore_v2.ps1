$target = "d:\VISOR_APS_TL\frontend-docs\src\App.jsx"
$bridge = "d:\VISOR_APS_TL\frontend-docs\src\bridge_v2.txt"
$temp = "d:\VISOR_APS_TL\frontend-docs\src\App.jsx.temp"

# Read part 1 (Header up to line 215)
# Line 215 is the end of LoginScreen
$p1 = [System.IO.File]::ReadAllLines($target) | Select-Object -First 215

# Read middle part (repaired components)
$p2 = Get-Content $bridge

# Read part 3 (Footer from original FolderNode start, skip 898)
# Line 899 is "function FolderNode..."
$p3 = [System.IO.File]::ReadAllLines($target) | Select-Object -Skip 898

# Concatenate and save
$all = $p1 + $p2 + $p3
[System.IO.File]::WriteAllLines($temp, $all)

# Replace original
Move-Item -Path $temp -Destination $target -Force
