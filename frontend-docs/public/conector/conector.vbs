' Conector ALEPHIA - lanzadera SIN VENTANA.
'
' powershell.exe es una aplicacion de consola y en Windows 11 la Terminal
' ignora -WindowStyle Hidden: la ventana negra aparecia igual. Lanzado desde
' aqui (wscript con estilo 0) no hay ventana nunca; la unica voz del
' conector son sus avisos en la bandeja del sistema.
If WScript.Arguments.Count > 0 Then
  Dim sh, ruta
  Set sh = CreateObject("WScript.Shell")
  ruta = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\ALEPHIA\conector.ps1"
  sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & ruta & """ """ & WScript.Arguments(0) & """", 0, False
End If
