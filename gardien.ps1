# ============================================================================
#  Gardien de « Calcul mental CM1 »
#  Lancé à l'ouverture de la session de l'enfant.
#  - ouvre l'appli (copie locale appli.html, sans compte ni site Claude) dans Microsoft Edge,
#    en plein écran, sans barre d'adresse, sur l'écran principal ;
#  - tant que ce n'est pas débloqué : les autres écrans sont recouverts, et si une autre fenêtre
#    passe devant (Alt+Tab, menu Démarrer, nouvelle fenêtre d'Edge…), l'appli est remise devant ;
#  - si l'enfant ferme l'appli avant d'avoir fini son programme du jour,
#    affiche un écran qui demande le CODE DU JOUR (donné par l'appli à la fin
#    du programme), ou le code des parents ;
#  - au bout de « minutesMax » minutes ACTIVES PASSÉES DANS LE PROGRAMME DU JOUR, l'ordinateur se débloque de toute façon
#    (v9 : l'entraînement libre et les jeux ne comptent pas ; filet de sécurité : 3 × minutesMax de temps actif en tout) ;
#  - v9 : fermer l'écran du code ou les caches par le Gestionnaire des tâches ne débloque plus (le gardien se relance) ;
#    la surveillance de chaque minute ne fait plus clignoter de fenêtre noire (console cachée) ;
#  - une fois débloqué, ne fait plus rien jusqu'au lendemain.
#  - au lancement : cherche une mise à jour sur GitHub (petit écran avec le hibou), puis ouvre l'appli ;
#  - -Ouvrir : (icône du bureau) mise à jour puis ouverture de l'appli, sans verrou ;
#  - envoie les déblocages au tableau de suivi des parents (si configuré) ;
#  - v4 : après le déblocage, reste discrètement en arrière-plan et REBLOQUE le lendemain (v5 : à partir de 16 h, réglable : "heureVerrou"),
#    même si la session n'a jamais été fermée (PC en veille ou allumé toute la nuit).
#  En cas de problème, le gardien s'arrête (il ne bloque jamais l'enfant par erreur).
#  Compatible Windows PowerShell 5.1 (Windows 10 / 11).
# ============================================================================
param([switch]$Test, [switch]$Ouvrir)
$GardienVersion = 9

$ErrorActionPreference = 'Stop'
$Self = $MyInvocation.MyCommand.Path
$Dir = Split-Path -Parent $Self
$LogFile = Join-Path $Dir 'gardien.log'
$HeartFile = Join-Path $Dir 'heartbeat.txt'
function Write-Heart { try { [IO.File]::WriteAllText($HeartFile, [string]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())) } catch { } }
function Read-Heart { try { return [int64]([IO.File]::ReadAllText($HeartFile)) } catch { return 0 } }

function Write-Log([string]$msg) {
  try {
    if ((Test-Path $LogFile) -and ((Get-Item $LogFile).Length -gt 200KB)) { Remove-Item $LogFile -Force }
    Add-Content -Path $LogFile -Value ("{0}  {1}" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $msg) -Encoding UTF8
  } catch { }
}

# --- Code du jour : même calcul que dans l'appli (FNV-1a 32 bits de « hibou-cm1|AAAA-MM-JJ ») ---
function Get-DayCode([string]$day) {
  $t = "hibou-cm1|$day"
  [uint64]$h = 2166136261
  foreach ($ch in $t.ToCharArray()) {
    $h = $h -bxor [uint64][int]$ch
    $h = ($h * [uint64]16777619) % [uint64]4294967296
  }
  return [string](1000 + ($h % [uint64]9000))
}

if ($Test) { return }   # utilisé par les vérifications : charge seulement les fonctions

# --- Réglages ---
$script:Today = (Get-Date).ToString('yyyy-MM-dd')
$Cfg = Get-Content -Path (Join-Path $Dir 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$ParentCode = [string]$Cfg.codeParents
$MinutesMax = [int]$Cfg.minutesMax
if ($MinutesMax -lt 5) { $MinutesMax = 30 }
# Le verrou ne s'applique qu'entre l'heure du verrou (16 h par défaut) et 5 h le lendemain matin : avant, l'ordinateur est libre.
$LockHour = 16
if ($Cfg.PSObject.Properties.Name -contains 'heureVerrou') { try { $LockHour = [int]$Cfg.heureVerrou } catch { $LockHour = 16 } }
if ($LockHour -lt 5 -or $LockHour -gt 23) { $LockHour = 16 }
function Get-LockDay([datetime]$t) { if ($t.Hour -lt 5) { return $t.Date.AddDays(-1).ToString('yyyy-MM-dd') } else { return $t.Date.ToString('yyyy-MM-dd') } }
function Test-LockWindow([datetime]$t) { return ($t.Hour -ge $LockHour -or $t.Hour -lt 5) }
$StateFile = Join-Path $Dir 'etat.json'
$EdgeProfile = Join-Path $Dir 'edge-profil'
$AppFile = Join-Path $Dir 'appli.html'
if (-not (Test-Path $AppFile)) { Write-Log 'appli.html introuvable : le gardien s''arrête.'; return }
$AppTitle = 'Calcul mental*'

function Get-State {
  try { return Get-Content -Path $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
}
function Set-Unlocked([string]$how) {
  $script:FreeDay = Get-LockDay (Get-Date)
  $o = [pscustomobject]@{ jour = $script:FreeDay; debloque = $true; comment = $how; heure = (Get-Date).ToString('HH:mm') }
  try { $o | ConvertTo-Json | Set-Content -Path $StateFile -Encoding UTF8 } catch { Write-Log ("État non enregistré : " + $_.Exception.Message) }
  Write-Log "Débloqué ($how)"
  Send-Stat 'déblocage' $how
}
$script:StatsUrl = ''
function Send-Stat([string]$type, [string]$detail) {
  if (-not $script:StatsUrl) { return }
  try {
    $min = [int]($script:ActiveSec / 60)
    $all = [int]($script:AllSec / 60)
    $body = @{ date = $script:Today; heure = (Get-Date).ToString('HH:mm'); enfant = ''; type = $type; domaine = 'ordinateur'; notion = ''; detail = "$detail (après $min min dans le programme, $all min actives en tout)" } | ConvertTo-Json -Compress
    Invoke-WebRequest -Uri $script:StatsUrl -Method Post -Body ([System.Text.Encoding]::UTF8.GetBytes($body)) -ContentType 'text/plain; charset=utf-8' -UseBasicParsing -TimeoutSec 6 | Out-Null
  } catch { Write-Log ("Envoi au suivi impossible : " + $_.Exception.Message) }
}

$st = Get-State
$script:FreeDay = ''
if ($st -and $st.debloque) { $script:FreeDay = [string]$st.jour }
$StartFree = (-not $Ouvrir -and ((-not (Test-LockWindow (Get-Date))) -or $script:FreeDay -eq (Get-LockDay (Get-Date))))
$script:WasKilled = (-not $Ouvrir -and (Test-LockWindow (Get-Date)) -and -not $StartFree -and ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds() - (Read-Heart)) -lt 180)
if (-not $Ouvrir) {   # un seul gardien à la fois
  $created = $false
  $script:Mutex = New-Object System.Threading.Mutex($true, 'Local\CalculMentalCM1Gardien', [ref]$created)
  if (-not $created) { return }   # un gardien tourne déjà (la surveillance passe chaque minute)
}

# --- Microsoft Edge ---
$EdgeExe = @(
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe')
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $EdgeExe) { Write-Log 'Edge introuvable : le gardien s''arrête.'; return }

function Start-App {
  $script:AppWin = [IntPtr]::Zero
  $edgeArgs = @("--user-data-dir=`"$EdgeProfile`"", "--app=`"$script:Url`"", '--start-fullscreen', '--window-position=0,0', '--no-first-run', '--no-default-browser-check')
  Start-Process -FilePath $EdgeExe -ArgumentList $edgeArgs | Out-Null
  $script:LastLaunch = Get-Date
  Write-Log 'Appli ouverte dans Edge.'
}
# L'appli est « ouverte » s'il existe une FENÊTRE Edge de notre profil
# (Edge peut laisser tourner des processus en arrière-plan sans fenêtre : ils ne comptent pas).
$script:EdgePids = @()
$script:AppWin = [IntPtr]::Zero
function Test-AppRunning {
  $ids = @(Get-CimInstance -ClassName Win32_Process -Filter "Name='msedge.exe'" -ErrorAction SilentlyContinue |
           Where-Object { $_.CommandLine -and $_.CommandLine.Contains($EdgeProfile) } | ForEach-Object { [int]$_.ProcessId })
  $script:EdgePids = $ids
  if ($ids.Count -eq 0) { return $false }
  if ($script:Win32) {
    try {
      $h = [GardienW]::FindApp([uint32[]]$ids, 'Calcul mental')
      if ($h -ne [IntPtr]::Zero) { $script:AppWin = $h; $script:LastTitle = [GardienW]::Title($h); return $true }
      $script:AppWin = [IntPtr]::Zero; return $false
    } catch { }
  }
  $win = Get-Process -Id $ids -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } | Select-Object -First 1
  if ($win -and $script:AppWin -eq [IntPtr]::Zero) { $script:AppWin = $win.MainWindowHandle }
  if ($win -and $win.MainWindowTitle) { $script:LastTitle = [string]$win.MainWindowTitle }   # l'appli y écrit « encore N étapes »
  return [bool]$win
}

# --- Mise à jour depuis GitHub (avec un petit écran « hibou ») ---
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$Start = Get-Date
$LocalVer = Join-Path $Dir 'version-locale.json'
function Get-LocalVer { try { return Get-Content -Path $LocalVer -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return [pscustomobject]@{ appli = ''; stats = '' } } }
function Update-App([switch]$Quiet) {
  $repo = [string]$Cfg.depot
  if (-not $repo) { $repo = 'https://raw.githubusercontent.com/Natchyyyy/calcul-mental-cm1/main' }
  $lv = Get-LocalVer
  if ($lv.stats) { $script:StatsUrl = [string]$lv.stats }
  $splash = $null
  if (-not $Quiet) { try {
    $splash = New-Object System.Windows.Forms.Form
    $splash.FormBorderStyle = 'None'; $splash.StartPosition = 'CenterScreen'; $splash.TopMost = $true; $splash.ShowInTaskbar = $false
    $splash.Size = New-Object System.Drawing.Size(420, 300); $splash.BackColor = [System.Drawing.Color]::FromArgb(255, 252, 248, 240)
    $pic = New-Object System.Windows.Forms.PictureBox
    $pic.SizeMode = 'Zoom'; $pic.Size = New-Object System.Drawing.Size(150, 150); $pic.Location = New-Object System.Drawing.Point(135, 30)
    try { $pic.Image = (New-Object System.Drawing.Icon((Join-Path $Dir 'icone.ico'), 256, 256)).ToBitmap() } catch { }
    $lab = New-Object System.Windows.Forms.Label
    $lab.Text = 'Je regarde s''il y a du nouveau…'; $lab.AutoSize = $false; $lab.TextAlign = 'MiddleCenter'
    $lab.Font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold); $lab.ForeColor = [System.Drawing.Color]::FromArgb(255, 27, 37, 69)
    $lab.Size = New-Object System.Drawing.Size(400, 60); $lab.Location = New-Object System.Drawing.Point(10, 200)
    [void]$splash.Controls.Add($pic); [void]$splash.Controls.Add($lab)
    $splash.Show(); [System.Windows.Forms.Application]::DoEvents()
  } catch { $splash = $null } }
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $stamp = [DateTime]::UtcNow.Ticks
    $rv = (Invoke-WebRequest -Uri "$repo/version.json?t=$stamp" -UseBasicParsing -TimeoutSec 6).Content | ConvertFrom-Json
    if ([string]$rv.stats) { $script:StatsUrl = [string]$rv.stats }
    $newApp = $false
    if ([string]$rv.appli -and [string]$rv.appli -ne [string]$lv.appli) {
      if ($splash) { $lab.Text = 'Mise à jour de l''appli…'; [System.Windows.Forms.Application]::DoEvents() }
      $tmp = Join-Path $Dir 'appli.tmp'
      Invoke-WebRequest -Uri "$repo/appli.html?t=$stamp" -UseBasicParsing -TimeoutSec 90 -OutFile $tmp
      $txt = [System.IO.File]::ReadAllText($tmp, [System.Text.Encoding]::UTF8)
      if ((Get-Item $tmp).Length -gt 200KB -and $txt.Contains('Calcul mental CM1') -and $txt.Contains('</script>')) {
        Move-Item -Force $tmp $AppFile; $newApp = $true
        Write-Log ("Appli mise à jour : version " + $rv.appli)
      } else { Remove-Item -Force $tmp -ErrorAction SilentlyContinue; Write-Log 'Mise à jour refusée (fichier incomplet).' }
    }
    if ([int]$rv.gardien -gt $GardienVersion) {
      $gt = Join-Path $Dir 'gardien.tmp'
      Invoke-WebRequest -Uri "$repo/gardien.ps1?t=$stamp" -UseBasicParsing -TimeoutSec 30 -OutFile $gt
      $code = [System.IO.File]::ReadAllText($gt, [System.Text.Encoding]::UTF8)
      $bytes = [System.IO.File]::ReadAllBytes($gt)
      $bom = $bytes.Length -gt 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
      $tok = $null; $errs = $null; [void][System.Management.Automation.Language.Parser]::ParseInput($code, [ref]$tok, [ref]$errs)
      if ($bom -and $errs.Count -eq 0 -and $code.Contains('Get-DayCode')) { Copy-Item -Force $gt (Join-Path $Dir 'gardien.ps1'); Write-Log ("Gardien mis à jour : version " + $rv.gardien + " (au prochain démarrage)") }
      Remove-Item -Force $gt -ErrorAction SilentlyContinue
    }
    $appVer = if ($newApp) { [string]$rv.appli } else { [string]$lv.appli }
    [pscustomobject]@{ appli = $appVer; stats = $script:StatsUrl } | ConvertTo-Json | Set-Content -Path $LocalVer -Encoding UTF8
    if ($newApp -and $splash) { $lab.Text = 'C''est à jour !'; [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 900 }
  } catch { Write-Log ("Pas de mise à jour (hors ligne ?) : " + $_.Exception.Message) }
  if ($splash) { try { $splash.Close(); $splash.Dispose() } catch { } }
}
function Build-Url {
  $script:Url = ([System.Uri]$AppFile).AbsoluteUri + '#gardien'
  if ($script:StatsUrl) { $script:Url += '&stats=' + [System.Uri]::EscapeDataString($script:StatsUrl) }
}
if ($StartFree) { Update-App -Quiet } else { Update-App }
if ($script:WasKilled) { Write-Log 'Gardien relancé (fermé pendant le programme ?).'; Send-Stat 'gardien relancé' 'fermé (ou PC redémarré) pendant le programme ?' }
# Lancement sans fenêtre : « conhost.exe --headless » (Windows 10 2004 et plus récents). On l'essaie d'abord pour de vrai :
# s'il ne marche pas sur ce PC, on garde l'ancienne façon (une petite fenêtre qui clignote vaut mieux qu'un gardien qui ne démarre pas).
function Get-HeadlessAction([string]$exe, [string]$exeArgs) {
  try {
    if ([Environment]::OSVersion.Version.Build -lt 19041) { return $null }
    $ch = Join-Path $env:WINDIR 'System32\conhost.exe'
    if (-not (Test-Path $ch)) { return $null }
    $okFile = Join-Path $Dir 'conhost-ok.txt'; $noFile = Join-Path $Dir 'conhost-non.txt'
    if (Test-Path $noFile) { return $null }   # déjà essayé : ne marche pas sur ce PC
    if (-not (Test-Path $okFile)) {
      $probe = Join-Path $Dir 'conhost-test.txt'
      Remove-Item -Force -ErrorAction SilentlyContinue $probe
      Start-Process -FilePath $ch -ArgumentList @('--headless', "`"$exe`"", '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', "Set-Content -Path '$probe' -Value ok") -WindowStyle Hidden | Out-Null
      for ($k = 0; $k -lt 40 -and -not (Test-Path $probe); $k++) { Start-Sleep -Milliseconds 250 }
      if (-not (Test-Path $probe)) { Set-Content -Path $noFile -Value 'non' -Encoding UTF8; Write-Log 'Console cachée indisponible sur ce PC : surveillance inchangée.'; return $null }
      Remove-Item -Force -ErrorAction SilentlyContinue $probe
      Set-Content -Path $okFile -Value 'ok' -Encoding UTF8
    }
    return (New-ScheduledTaskAction -Execute $ch -Argument "--headless `"$exe`" $exeArgs" -WorkingDirectory $Dir)
  } catch { return $null }
}
# surveillance : une tâche planifiée relance le gardien chaque minute s'il a été fermé (créée une seule fois)
if (-not $Ouvrir) {
  try {
    $wTask = 'Calcul mental CM1 (surveillance)'
    $wPs = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $wArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -STA -File `"$Self`""
    $wAct = New-ScheduledTaskAction -Execute $wPs -Argument $wArgs -WorkingDirectory $Dir
    $wHead = Get-HeadlessAction $wPs $wArgs   # sans fenêtre noire qui clignote chaque minute (si Windows le permet)
    if ($wHead) { $wAct = $wHead }
    $wOld = Get-ScheduledTask -TaskName $wTask -ErrorAction SilentlyContinue
    if ($wOld -and $wHead -and -not (@($wOld.Actions)[0].Execute -like '*conhost.exe')) {
      try { Set-ScheduledTask -TaskName $wTask -Action $wHead | Out-Null; Write-Log 'Surveillance : console cachée (plus de fenêtre noire chaque minute).' }
      catch { Write-Log ('Surveillance non modifiée : ' + $_.Exception.Message) }
    }
    if (-not $wOld) {
      $wSet = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 0)
      $wRep = (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)).Repetition
      try {   # à l'ouverture de session + chaque minute
        $wTrg = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME; $wTrg.Repetition = $wRep
        Register-ScheduledTask -TaskName $wTask -Action $wAct -Trigger $wTrg -Settings $wSet -Description 'Relance le gardien de Calcul mental CM1 s''il a été fermé.' -Force | Out-Null
      } catch {   # plan B (sans droits élevés) : chaque minute, à partir de maintenant
        $wTrg = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)
        Register-ScheduledTask -TaskName $wTask -Action $wAct -Trigger $wTrg -Settings $wSet -Description 'Relance le gardien de Calcul mental CM1 s''il a été fermé.' -Force | Out-Null
      }
      Write-Log 'Surveillance installée (relance chaque minute si le gardien est fermé).'
    }
    $wT = Get-ScheduledTask -TaskName $wTask -ErrorAction SilentlyContinue
    if ($wT -and ($wT.Triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' })) {   # la tâche lance aussi le gardien à l'ouverture de session
      $oldLnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Calcul mental CM1 (gardien).lnk'
      if (Test-Path $oldLnk) { Remove-Item -Force -ErrorAction SilentlyContinue $oldLnk; Write-Log 'Raccourci de démarrage retiré (la surveillance lance le gardien).' }
    }
  } catch { Write-Log ('Surveillance non installée : ' + $_.Exception.Message) }
}
Build-Url
if ($Ouvrir) { Start-App; return }

# --- Écran de déblocage ---
$script:Win32 = $false
try {
  Add-Type -TypeDefinition @'
using System; using System.Text; using System.Runtime.InteropServices;
public static class GardienW {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LASTINPUTINFO p);
  public static uint IdleMs() { var li = new LASTINPUTINFO(); li.cbSize = (uint)Marshal.SizeOf(li); if (!GetLastInputInfo(ref li)) return 0; return (uint)Environment.TickCount - li.dwTime; }
  public static string Title(IntPtr h) { var sb = new StringBuilder(256); GetWindowText(h, sb, 256); return sb.ToString(); }
  public static uint Pid(IntPtr h) { uint p; GetWindowThreadProcessId(h, out p); return p; }
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  public static IntPtr FindApp(uint[] pids, string prefix) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      if (!IsWindowVisible(h)) return true;
      if (Array.IndexOf(pids, Pid(h)) < 0) return true;
      string t = Title(h);
      if (t.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && t.IndexOf("Edge", StringComparison.OrdinalIgnoreCase) < 0) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
  public static void Front(IntPtr h) {
    if (IsIconic(h)) ShowWindow(h, 9);
    keybd_event(0x12, 0, 0, UIntPtr.Zero); SetForegroundWindow(h); keybd_event(0x12, 0, 2, UIntPtr.Zero);
  }
}
'@
  [GardienW]::SetProcessDPIAware() | Out-Null
  $script:Win32 = $true
} catch { Write-Log ("Fonctions Windows indisponibles (pas de surveillance des fenêtres) : " + $_.Exception.Message) }
[System.Windows.Forms.Application]::EnableVisualStyles()

$script:LastLaunch = [datetime]::MinValue
$script:Grace = 30          # 1re ouverture (démarrage de Windows, parfois lent) ; ensuite 12 s
$script:Unlocked = [bool]$StartFree
$script:Start = $Start
$script:LastTick = $null
$script:HeartN = 0
$script:ActiveSec = 0      # temps passé dans le PROGRAMME DU JOUR (clavier ou souris utilisés dans la dernière minute)
$script:AllSec = 0         # temps actif en tout (filet de sécurité : 3 × minutesMax)
$script:SawProg = $false   # l'appli dit-elle « programme en cours » ? (sinon, ancienne appli : tout le temps compte)
$Ctx = New-Object System.Windows.Forms.ApplicationContext
# débloqué : on cache tout et on attend le lendemain (le gardien reste lancé)
function Enter-Free {
  $script:Unlocked = $true
  $script:Running = $false
  try { Remove-Item -Force -ErrorAction SilentlyContinue $HeartFile } catch { }
  foreach ($cv in $script:Covers) { try { $cv.Hide() } catch { } }
  try { $form.Hide() } catch { }
  Write-Log ("Mode libre jusqu'au prochain verrou ($LockHour h).")
}
# arrêt complet (erreur, redémarrage) : ne bloque jamais l'enfant
function Exit-Gardien {
  $script:Unlocked = $true
  try { $timer.Stop() } catch { }
  try { $fast.Stop() } catch { }
  foreach ($cv in $script:Covers) { try { $cv.Close() } catch { } }
  try { $form.Close() } catch { }
  try { if ($script:Mutex) { $script:Mutex.ReleaseMutex(); $script:Mutex.Dispose(); $script:Mutex = $null } } catch { }
  $Ctx.ExitThread()
}
function Test-NewerGardien {
  try { $t = [System.IO.File]::ReadAllText($Self, [System.Text.Encoding]::UTF8); if ($t -match '\$GardienVersion = (\d+)') { return ([int]$Matches[1] -gt $GardienVersion) } } catch { }
  return $false
}
function Restart-Self {
  Write-Log 'Redémarrage du gardien.'
  try { Remove-Item -Force -ErrorAction SilentlyContinue $HeartFile } catch { }
  try { if ($script:Mutex) { $script:Mutex.ReleaseMutex(); $script:Mutex.Dispose(); $script:Mutex = $null } } catch { }
  Start-Process -WindowStyle Hidden -FilePath (Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-STA', '-File', "`"$Self`"") | Out-Null
  Exit-Gardien
}
$script:InNewDay = $false
function Start-NewDay {
  if ($script:InNewDay) { return }
  $script:InNewDay = $true
  try { Start-NewDayCore } finally { $script:InNewDay = $false }
}
function Start-NewDayCore {
  $script:Today = (Get-Date).ToString('yyyy-MM-dd')
  $script:Start = Get-Date
  $script:ActiveSec = 0
  $script:AllSec = 0
  $st2 = Get-State
  if ($st2 -and $st2.jour -eq (Get-LockDay (Get-Date)) -and $st2.debloque) { $script:FreeDay = [string]$st2.jour; return }
  Update-App
  if ((Test-NewerGardien) -or $form.IsDisposed) {   # gardien plus récent téléchargé (ou fenêtre perdue) : on relance proprement
    Restart-Self; return
  }
  Build-Url
  $script:Unlocked = $false
  $script:Grace = 30
  $script:AppWin = [IntPtr]::Zero
  $script:LastTitle = ''
  Write-Log 'Nouveau jour : verrou remis.'
  Show-Covers
  if (-not (Test-AppRunning)) { Start-App } else { $script:LastLaunch = Get-Date }
}

$Bg = [System.Drawing.Color]::FromArgb(255, 252, 248, 240)
$Ink = [System.Drawing.Color]::FromArgb(255, 27, 37, 69)
$Orange = [System.Drawing.Color]::FromArgb(255, 196, 82, 0)

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Calcul mental CM1'
$form.FormBorderStyle = 'None'
$form.WindowState = 'Maximized'
$form.TopMost = $true
$form.ShowInTaskbar = $true
$form.BackColor = $Bg
$form.KeyPreview = $true

$panel = New-Object System.Windows.Forms.TableLayoutPanel
$panel.ColumnCount = 1
$panel.AutoSize = $true
$panel.AutoSizeMode = 'GrowAndShrink'
$panel.Anchor = 'None'
$panel.BackColor = $Bg

function New-Label([string]$text, [float]$size, [bool]$bold) {
  $l = New-Object System.Windows.Forms.Label
  $l.Text = $text
  $l.AutoSize = $true
  $l.MaximumSize = New-Object System.Drawing.Size(900, 0)
  $l.ForeColor = $Ink
  $style = [System.Drawing.FontStyle]::Regular
  if ($bold) { $style = [System.Drawing.FontStyle]::Bold }
  $l.Font = New-Object System.Drawing.Font('Segoe UI', $size, $style)
  $l.Anchor = 'None'
  $l.TextAlign = 'MiddleCenter'
  $l.Margin = New-Object System.Windows.Forms.Padding(10, 8, 10, 8)
  return $l
}
function New-Button([string]$text, [bool]$main) {
  $b = New-Object System.Windows.Forms.Button
  $b.Text = $text
  $b.AutoSize = $true
  $b.Font = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
  $b.Padding = New-Object System.Windows.Forms.Padding(24, 10, 24, 10)
  $b.Margin = New-Object System.Windows.Forms.Padding(10, 10, 10, 10)
  $b.FlatStyle = 'Flat'
  $b.FlatAppearance.BorderSize = 0
  $b.Anchor = 'None'
  $b.Cursor = 'Hand'
  if ($main) { $b.BackColor = $Orange; $b.ForeColor = [System.Drawing.Color]::White }
  else { $b.BackColor = [System.Drawing.Color]::White; $b.ForeColor = $Ink }
  return $b
}

$title = New-Label 'Ton programme du jour t''attend !' 34 $true
$text = New-Label "Termine « Mon programme du jour » dans l'appli (la grande carte en haut de l'accueil). À la fin, l'appli te donne ton CODE DU JOUR : tape-le ici pour débloquer l'ordinateur." 17 $false
$box = New-Object System.Windows.Forms.TextBox
$box.Font = New-Object System.Drawing.Font('Segoe UI', 30, [System.Drawing.FontStyle]::Bold)
$box.Width = 240
$box.MaxLength = [Math]::Max(4, [Math]::Min(40, ([string]$ParentCode).Length))
$box.TextAlign = 'Center'
$box.Anchor = 'None'
$box.Margin = New-Object System.Windows.Forms.Padding(10, 14, 10, 6)
$msg = New-Label '' 15 $true
$msg.ForeColor = $Orange
$btnOk = New-Button 'Débloquer' $true
$btnBack = New-Button 'Retourner à l''appli' $false
$btns = New-Object System.Windows.Forms.FlowLayoutPanel
$btns.AutoSize = $true
$btns.Anchor = 'None'
$btns.BackColor = $Bg
[void]$btns.Controls.Add($btnBack)
[void]$btns.Controls.Add($btnOk)
$help = New-Label 'Un parent peut aussi taper son code.' 12 $false
$help.ForeColor = [System.Drawing.Color]::FromArgb(255, 90, 99, 128)

foreach ($c in @($title, $text, $box, $msg, $btns, $help)) { [void]$panel.Controls.Add($c) }
[void]$form.Controls.Add($panel)

$script:LastTitle = ''
$TextBase = $text.Text
# texte de l'écran du code : combien d'étapes il reste (lu dans le titre de la fenêtre de l'appli)
function Set-LockText {
  $t = $script:LastTitle
  if ($t -match 'encore (\d+) [ée]tape') {
    $n = [int]$Matches[1]; $e = if ($n -gt 1) { "$n étapes" } else { '1 étape' }
    $text.Text = "Encore $e dans « Mon programme du jour » et l'ordinateur est à toi ! Clique sur « Retourner à l'appli » pour finir. À la fin, l'appli te donne ton CODE DU JOUR : tape-le ici."
  } elseif ($t -match 'code du jour obtenu') {
    $text.Text = "Tu as fini ton programme : bravo ! Ton CODE DU JOUR est écrit dans l'appli (sur l'accueil). Tape-le ici."
  } else { $text.Text = $TextBase }
}
function Center-Panel {
  $panel.Left = [int](($form.ClientSize.Width - $panel.Width) / 2)
  $panel.Top = [int](($form.ClientSize.Height - $panel.Height) / 2)
}
$form.Add_Resize({ Center-Panel })
$form.Add_Shown({ Center-Panel; $box.Focus() })

function Try-Unlock {
  $v = $box.Text.Trim()
  $veille = (Get-Date).AddMinutes(-30).ToString('yyyy-MM-dd')
  if ($v -eq (Get-DayCode $script:Today) -or $v -eq (Get-DayCode $veille) -or $v -eq (Get-DayCode (Get-LockDay (Get-Date)))) { Set-Unlocked 'code du jour' }
  elseif ($ParentCode -and $v -eq $ParentCode) { Set-Unlocked 'code parents' }
  else {
    $msg.Text = 'Ce n''est pas le bon code. Finis ton programme du jour : le code s''affiche à la fin.'
    $box.SelectAll(); $box.Focus(); Center-Panel
    Write-Log "Mauvais code tapé."
    return
  }
  Enter-Free
}
$btnOk.Add_Click({ Try-Unlock })
$box.Add_KeyDown({ param($s, $e) if ($e.KeyCode -eq 'Enter') { $e.SuppressKeyPress = $true; Try-Unlock } })
$btnBack.Add_Click({ $form.Hide(); $msg.Text = ''; $box.Text = ''; $script:Grace = 12; Start-App })
$form.Add_FormClosing({ param($s, $e) if ($e.CloseReason -eq 'WindowsShutDown') { return }; if (-not $script:Unlocked) { $e.Cancel = $true; if ($e.CloseReason -eq 'TaskManagerClosing') { Write-Log 'Fermeture de l''écran du code par le Gestionnaire des tâches : refusée.' } } })

# --- Autres écrans : recouverts tant que ce n'est pas débloqué ---
$script:Covers = @()
$script:ScreensKey = ''
function New-Covers {
  foreach ($cv in $script:Covers) { try { $cv.Dispose() } catch { } }
  $script:Covers = @()
  foreach ($scr in [System.Windows.Forms.Screen]::AllScreens) {
    if ($scr.Primary) { continue }
    $cv = New-Object System.Windows.Forms.Form
    $cv.FormBorderStyle = 'None'; $cv.StartPosition = 'Manual'; $cv.Bounds = $scr.Bounds
    $cv.TopMost = $true; $cv.ShowInTaskbar = $false
    $cv.BackColor = [System.Drawing.Color]::FromArgb(255, 20, 30, 60)
    $cl = New-Object System.Windows.Forms.Label
    $cl.Text = "Fais ton programme du jour sur l'autre écran !"
    $cl.ForeColor = [System.Drawing.Color]::White
    $cl.Font = New-Object System.Drawing.Font('Segoe UI', 28, [System.Drawing.FontStyle]::Bold)
    $cl.Dock = 'Fill'; $cl.TextAlign = 'MiddleCenter'
    [void]$cv.Controls.Add($cl)
    $cv.Add_FormClosing({ param($s, $e) if ($e.CloseReason -eq 'WindowsShutDown') { return }; if (-not $script:Unlocked) { $e.Cancel = $true } })
    $script:Covers += $cv
  }
}
function Show-Covers {
  $key = (@([System.Windows.Forms.Screen]::AllScreens | ForEach-Object { [string]$_.Bounds }) -join ';')
  if (@($script:Covers | Where-Object { $_.IsDisposed }).Count -gt 0) { $script:ScreensKey = ''; Write-Log 'Cache d''un écran fermé de force : refait.' }
  if ($key -ne $script:ScreensKey) {
    if ($script:ScreensKey) { Write-Log 'Écrans changés : caches refaits.' }
    $script:ScreensKey = $key
    $old = $script:Covers; $script:Covers = @()
    foreach ($cv in $old) { try { $cv.Hide(); $cv.Dispose() } catch { } }
    New-Covers
  }
  foreach ($cv in $script:Covers) { if (-not $cv.Visible) { $cv.Show() }; $cv.Bounds = $cv.Bounds }
}

# --- Garder l'appli devant (toutes les 0,7 s, tant que l'appli est ouverte) ---
$script:Running = $false
$fast = New-Object System.Windows.Forms.Timer
$fast.Interval = 700
$fast.Add_Tick({
  try {
    if ($script:Unlocked -or -not $script:Win32) { return }
    if ($form.Visible) {
      $fg = [GardienW]::GetForegroundWindow()
      if ($fg -eq $form.Handle) { return }
      foreach ($cv in $script:Covers) { if ($fg -eq $cv.Handle) { return } }
      if ($form.WindowState -ne 'Maximized') { $form.WindowState = 'Maximized' }
      [GardienW]::Front($form.Handle); $box.Focus() | Out-Null
      return
    }
    if (-not $script:Running) { return }
    if (((Get-Date) - $script:LastLaunch).TotalSeconds -lt 8) { return }
    $fg = [GardienW]::GetForegroundWindow()
    if ($fg -eq [IntPtr]::Zero) { return }
    $pid0 = [int][GardienW]::Pid($fg)
    if ($script:EdgePids -contains $pid0) {
      $tt = [GardienW]::Title($fg)
      if ($tt -like $AppTitle -and $tt -notlike '*Edge*') { $script:AppWin = $fg; return }
      if ($tt -notlike '*Edge*') { return }                                          # bulle d'Edge (ex. « autoriser le micro ») : on la laisse
      [void][GardienW]::PostMessage($fg, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)   # autre fenêtre de navigateur : fermée
      Write-Log ("Fenêtre fermée : " + [GardienW]::Title($fg))
      return
    }
    if ($script:AppWin -ne [IntPtr]::Zero -and [GardienW]::IsWindow($script:AppWin)) { [GardienW]::Front($script:AppWin) }
  } catch { }
})

# --- Surveillance toutes les 2 secondes ---
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.Add_Tick({
  try {
    $now = Get-Date
    $d = $now.ToString('yyyy-MM-dd')
    if ($script:Unlocked) {   # libre : le verrou revient à l'heure du verrou (16 h), si ce jour-là n'est pas encore débloqué
      if ((Test-LockWindow $now) -and (Get-LockDay $now) -ne $script:FreeDay) { Start-NewDay }
      return
    }
    if (-not (Test-LockWindow $now)) {   # resté verrouillé toute la nuit : de 5 h à l'heure du verrou, c'est libre
      Write-Log 'Hors des heures du verrou : libre jusqu''à l''heure du verrou.'; Enter-Free; return
    }
    if ($d -ne $script:Today) { $script:Today = $d; $script:Start = $now }   # minuit pendant le verrou : nouveau code (le temps actif continue)
    if ($script:LastTick -and ($now - $script:LastTick).TotalMinutes -gt 60 -and $now.Hour -ge 5) { $script:ActiveSec = 0; $script:AllSec = 0; Write-Log 'Longue pause (veille) : temps actif remis à zéro.' }
    if ($form.IsDisposed) { Write-Log 'Écran du code fermé de force : le gardien se relance.'; Send-Stat 'gardien relancé' 'écran du code fermé de force'; Restart-Self; return }
    $script:LastTick = $now
    $script:HeartN = ($script:HeartN + 1) % 15; if ($script:HeartN -eq 0) { Write-Heart }
    $idle = 0; if ($script:Win32) { try { $idle = [GardienW]::IdleMs() } catch { $idle = 0 } }
    $running = Test-AppRunning
    $script:Running = $running
    $inProg = $running -and $script:LastTitle -match 'programme en cours'
    if ($running -and $script:LastTitle -match 'programme en cours|hors programme') { $script:SawProg = $true }   # appli récente : elle dit où en est l'enfant
    if ($idle -lt 60000) {
      $script:AllSec += 2
      if ($inProg -or -not $script:SawProg) { $script:ActiveSec += 2 }   # seul le temps passé dans le programme du jour compte
    }
    if ($script:ActiveSec / 60 -ge $MinutesMax) {                                # plafond de temps ACTIF dans le programme : c'est bon pour aujourd'hui
      Set-Unlocked "plafond de $MinutesMax minutes dans le programme"; Enter-Free; return
    }
    if ($script:AllSec / 60 -ge 3 * $MinutesMax) {                                # filet de sécurité (programme impossible à finir ?)
      Set-Unlocked ("plafond de sécurité : " + (3 * $MinutesMax) + " minutes actives sans finir le programme"); Enter-Free; return
    }
    if ($running -and $script:LastTitle -notmatch 'Edge' -and $script:LastTitle -match 'code du jour obtenu (\d{4})' -and ($Matches[1] -eq (Get-DayCode $script:Today) -or $Matches[1] -eq (Get-DayCode (Get-LockDay $now)))) {   # programme fini (le matin, le week-end…) : pas besoin de taper le code
      Set-Unlocked 'programme du jour fini (vu dans l''appli)'; Enter-Free; return
    }
    Show-Covers
    if ($running) { if ($form.Visible) { $form.Hide() }; return }
    if (($now - $script:LastLaunch).TotalSeconds -lt $script:Grace) { return }  # Edge est en train de s'ouvrir
    if (-not $form.Visible) { $box.Text = ''; Set-LockText; $form.Show(); $form.Activate(); Center-Panel; $box.Focus(); Write-Log 'Appli fermée avant la fin : écran du code.' }
    else { $form.TopMost = $true; $form.Activate() }
  } catch {
    Write-Log ("Erreur : " + $_.Exception.Message + " → libre pour aujourd'hui, le gardien revient demain.")
    $script:FreeDay = Get-LockDay (Get-Date)   # libre jusqu'au prochain verrou (pas de relance en boucle)
    try { Enter-Free } catch { Exit-Gardien }
  }
})

try {
  if ($StartFree) { Write-Log 'Déjà débloqué aujourd''hui : le gardien attend demain.' }
  else { Write-Log "Démarrage du gardien (plafond $MinutesMax min)."; Show-Covers; if (-not (Test-AppRunning)) { Start-App } else { $script:LastLaunch = Get-Date } }
  $timer.Start()
  $fast.Start()
  [System.Windows.Forms.Application]::Run($Ctx)
  Write-Log 'Gardien terminé.'
} catch {
  Write-Log ("Erreur au démarrage : " + $_.Exception.Message)
}
