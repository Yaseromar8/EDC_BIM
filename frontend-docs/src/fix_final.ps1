$target = "d:\VISOR_APS_TL\frontend-docs\src\App.jsx"
$temp = "d:\VISOR_APS_TL\frontend-docs\src\App.jsx.final"

# Read everything with UTF8 NO BOM
$content = [System.IO.File]::ReadAllLines($target, [System.Text.Encoding]::UTF8)

# Find where to insert the FolderNode header. 
# We know it's around lines 570-571 in the NEW file.
# We want to replace line 571 (index 570) with the header.

$p1 = $content[0..569] # 1 to 570
$p3 = $content[571..($content.Length-1)] # 572 to end

$header = @(
"// -------------------------------------",
"// 3.5 RECURSIVE FOLDER NODE (Sidebar)",
"// -------------------------------------",
"function FolderNode({ folder, currentPath, onNavigate, projectPrefix, level = 0, isAdmin, onTreeRefresh, onGlobalRefresh, refreshSignal, onInitiateMove, project }) {",
"  const [expanded, setExpanded] = useState(currentPath.startsWith(folder.fullName));",
"  const [children, setChildren] = useState(null);",
"  const [loading, setLoading] = useState(false);",
"  const [showMenu, setShowMenu] = useState(false);",
"  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });",
"  const [isRenaming, setIsRenaming] = useState(false);",
"  const [renameValue, setRenameValue] = useState(folder.name);",
"  const [isCreatingChild, setIsCreatingChild] = useState(false);",
"  const [newChildName, setNewChildName] = useState('');",
"  const menuRef = useRef(null);",
"  useEffect(() => {",
"    if (currentPath.startsWith(folder.fullName) && !expanded) {",
"      setExpanded(true);",
"    }",
"  }, [currentPath, folder.fullName, expanded]);"
)

$final = $p1 + $header + $p3

# Write back with UTF8 to fix encoding artifacts globally
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($temp, $final, $utf8NoBom)

# Replace original
Move-Item -Path $temp -Destination $target -Force
