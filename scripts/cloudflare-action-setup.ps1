[CmdletBinding()]
param(
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$CredentialPath = (Join-Path $env:LOCALAPPDATA 'Lexiapp\credentials\cloudflare-worker-secrets.xml'),
    [switch]$Diagnostic
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$actionSetupResult = 'cancelled'
$actionFormsReady = $false
$actionDialog = $null
$actionKeyBox = $null
$actionSecureContainer = $null
$actionBstr = [IntPtr]::Zero
$actionJson = $null
$actionContainer = $null
$actionKey = $null

function Resolve-ActionCredentialPath {
    param([Parameter(Mandatory)][string]$Candidate)
    if (-not [IO.Path]::IsPathRooted($Candidate) -or $Candidate -notmatch '^[A-Za-z]:[\\/]') {
        throw 'Ruta local invalida.'
    }
    $resolved = [IO.Path]::GetFullPath($Candidate)
    if ([IO.Path]::GetExtension($resolved) -ne '.xml' -or
        [IO.DriveInfo]::new([IO.Path]::GetPathRoot($resolved)).DriveType -eq [IO.DriveType]::Network) {
        throw 'Ruta local invalida.'
    }
    foreach ($syncRoot in @($env:OneDrive, $env:OneDriveConsumer, $env:OneDriveCommercial)) {
        if (-not [string]::IsNullOrWhiteSpace($syncRoot)) {
            $syncPath = [IO.Path]::GetFullPath($syncRoot).TrimEnd([char[]]'\/')
            if ($resolved.Equals($syncPath, [StringComparison]::OrdinalIgnoreCase) -or
                $resolved.StartsWith($syncPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
                throw 'Ruta local invalida.'
            }
        }
    }
    $ancestor = $resolved
    while (-not [string]::IsNullOrWhiteSpace($ancestor)) {
        if (Test-Path -LiteralPath $ancestor) {
            $item = Get-Item -LiteralPath $ancestor -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
                ($ancestor -eq $resolved -and $item.PSIsContainer)) { throw 'Ruta local invalida.' }
        }
        $ancestor = [IO.Path]::GetDirectoryName($ancestor)
    }
    return $resolved
}

try {
    if ($env:OS -ne 'Windows_NT' -or
        [Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA) {
        throw 'Requiere PowerShell Windows STA.'
    }
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [Windows.Forms.Application]::EnableVisualStyles()
    $actionFormsReady = $true
    $actionPath = Resolve-ActionCredentialPath -Candidate $CredentialPath
    $actionSchemaName = if ($Diagnostic) { 'openapi.diagnostic.yaml' } else { 'openapi.yaml' }
    $actionSchemaPath = [IO.Path]::GetFullPath((Join-Path (Join-Path $PSScriptRoot '..\workers\transcriptor-legal') $actionSchemaName))
    $actionInstructionsPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\docs\gpt_transcription_action.txt'))
    $actionFullInstructionsPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\docs\gpt_instructions_full.txt'))
    $actionSecureContainer = Import-Clixml -LiteralPath $actionPath
    if ($actionSecureContainer -isnot [Security.SecureString]) { throw 'Contenedor local invalido.' }
    try {
        $actionBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($actionSecureContainer)
        $actionJson = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($actionBstr)
        $actionContainer = ConvertFrom-Json -InputObject $actionJson
        $actionProperty = $actionContainer.PSObject.Properties['ACTION_API_KEY']
        if ($null -eq $actionProperty -or $actionProperty.Value -isnot [string] -or
            $actionProperty.Value.Length -lt 20 -or $actionProperty.Value -match '\s') {
            throw 'Clave de accion local invalida.'
        }
        $actionKey = $actionProperty.Value
        $actionProperty = $null
    }
    finally {
        if ($actionBstr -ne [IntPtr]::Zero) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($actionBstr)
            $actionBstr = [IntPtr]::Zero
        }
        $actionJson = $null
        $actionContainer = $null
        $actionSecureContainer.Dispose()
        $actionSecureContainer = $null
    }

    $actionDialog = [Windows.Forms.Form]::new()
    $actionDialog.Text = if ($Diagnostic) { 'Lexiapp · Probar consulta del GPT' } else { 'Lexiapp · Conectar acción del GPT' }
    $actionDialog.ClientSize = [Drawing.Size]::new(590, 410)
    $actionDialog.StartPosition = [Windows.Forms.FormStartPosition]::CenterScreen
    $actionDialog.FormBorderStyle = [Windows.Forms.FormBorderStyle]::FixedDialog
    $actionDialog.MaximizeBox = $false
    $actionDialog.Font = [Drawing.Font]::new('Segoe UI', 10)

    $actionInstructions = [Windows.Forms.Label]::new()
    $actionInstructions.Location = [Drawing.Point]::new(22, 20)
    $actionInstructions.Size = [Drawing.Size]::new(546, 108)
    $actionInstructions.Text = if ($Diagnostic) {
        "Esquema temporal de prueba con una sola consulta.`r`nPégalo en Configurar → Acciones → Esquema y guarda el GPT.`r`nConserva la autenticación Bearer y las instrucciones actuales.`r`nPrueba el trabajo ficticio lexia-smoke-gpt-20261002."
    } else {
        "En tu GPT: Configurar → Acciones → pega el esquema OpenAPI.`r`nAutenticación: API Key → Bearer; pega la clave sin el prefijo Bearer.`r`nSi supera 8.000 caracteres, copia las instrucciones completas.`r`nSustituyen todo el campo Instrucciones y conservan las reglas originales."
    }
    $actionDialog.Controls.Add($actionInstructions)

    $actionKeyBox = [Windows.Forms.TextBox]::new()
    $actionKeyBox.Location = [Drawing.Point]::new(22, 138)
    $actionKeyBox.Size = [Drawing.Size]::new(546, 28)
    $actionKeyBox.Name = 'ActionApiKey'
    $actionKeyBox.AccessibleName = 'Clave de acción enmascarada'
    $actionKeyBox.ReadOnly = $true
    $actionKeyBox.UseSystemPasswordChar = $true
    $actionKeyBox.ShortcutsEnabled = $false
    $actionKeyBox.Text = $actionKey
    $actionKey = $null
    $actionDialog.Controls.Add($actionKeyBox)

    $actionCopySchema = [Windows.Forms.Button]::new()
    $actionCopySchema.Location = [Drawing.Point]::new(22, 180)
    $actionCopySchema.Size = [Drawing.Size]::new(240, 34)
    $actionCopySchema.Text = if ($Diagnostic) { 'Copiar esquema de prueba' } else { 'Copiar esquema' }
    $actionDialog.Controls.Add($actionCopySchema)
    $actionCopyKey = [Windows.Forms.Button]::new()
    $actionCopyKey.Location = [Drawing.Point]::new(274, 180)
    $actionCopyKey.Size = [Drawing.Size]::new(294, 34)
    $actionCopyKey.Text = 'Copiar clave de acción'
    $actionDialog.Controls.Add($actionCopyKey)
    $actionCopyInstructions = [Windows.Forms.Button]::new()
    $actionCopyInstructions.Location = [Drawing.Point]::new(22, 226)
    $actionCopyInstructions.Size = [Drawing.Size]::new(366, 34)
    $actionCopyInstructions.Text = 'Copiar instrucciones de transcripción'
    $actionCopyInstructions.Enabled = -not $Diagnostic
    $actionDialog.Controls.Add($actionCopyInstructions)
    $actionCopyFullInstructions = [Windows.Forms.Button]::new()
    $actionCopyFullInstructions.Location = [Drawing.Point]::new(22, 272)
    $actionCopyFullInstructions.Size = [Drawing.Size]::new(366, 34)
    $actionCopyFullInstructions.Text = 'Copiar instrucciones completas'
    $actionCopyFullInstructions.Enabled = -not $Diagnostic
    $actionDialog.Controls.Add($actionCopyFullInstructions)
    $actionStatus = [Windows.Forms.Label]::new()
    $actionStatus.Location = [Drawing.Point]::new(22, 320)
    $actionStatus.Size = [Drawing.Size]::new(546, 35)
    $actionDialog.Controls.Add($actionStatus)
    $actionClose = [Windows.Forms.Button]::new()
    $actionClose.Location = [Drawing.Point]::new(468, 362)
    $actionClose.Size = [Drawing.Size]::new(100, 30)
    $actionClose.Text = 'Cerrar'
    $actionClose.DialogResult = [Windows.Forms.DialogResult]::Cancel
    $actionDialog.Controls.Add($actionClose)
    $actionDialog.CancelButton = $actionClose

    $actionCopySchema.add_Click({
        try {
            $actionSchema = [IO.File]::ReadAllText($actionSchemaPath)
            if ([string]::IsNullOrWhiteSpace($actionSchema) -or $actionSchema -notmatch '(?m)^openapi:\s*3\.') {
                throw 'Esquema local invalido.'
            }
            [Windows.Forms.Clipboard]::SetText($actionSchema)
            $actionStatus.Text = if ($Diagnostic) { 'Esquema de prueba copiado. Reemplaza Esquema en la misma acción y guarda.' } else { 'Esquema copiado. Pégalo en Acciones del GPT.' }
            $actionSchema = $null
        }
        catch { $actionStatus.Text = 'No se pudo copiar el esquema. Comprueba el archivo y vuelve a intentarlo.' }
    })
    $actionCopyKey.add_Click({
        try {
            [Windows.Forms.Clipboard]::SetText($actionKeyBox.Text)
            $actionStatus.Text = 'Clave copiada. Pégala en API Key / Bearer sin añadir el prefijo Bearer.'
        }
        catch { $actionStatus.Text = 'No se pudo copiar la clave. Vuelve a intentarlo.' }
    })
    $actionCopyInstructions.add_Click({
        try {
            $actionTechnicalBlock = [IO.File]::ReadAllText($actionInstructionsPath)
            if ([string]::IsNullOrWhiteSpace($actionTechnicalBlock)) { throw 'Bloque local invalido.' }
            [Windows.Forms.Clipboard]::SetText($actionTechnicalBlock)
            $actionStatus.Text = 'Bloque copiado. Pégalo solo en TRANSCRIPCIÓN DE VIDEO y conserva el resto.'
            $actionTechnicalBlock = $null
        }
        catch { $actionStatus.Text = 'No se pudieron copiar las instrucciones. Comprueba el archivo y vuelve a intentarlo.' }
    })
    $actionCopyFullInstructions.add_Click({
        try {
            $actionFullInstructions = [IO.File]::ReadAllText($actionFullInstructionsPath)
            if ([string]::IsNullOrWhiteSpace($actionFullInstructions) -or $actionFullInstructions.Length -gt 8000 -or
                $actionFullInstructions -notmatch 'TRANSCRIPCIÓN DE VIDEO' -or $actionFullInstructions -notmatch 'DECLARACIONES') {
                throw 'Instrucciones completas locales invalidas.'
            }
            [Windows.Forms.Clipboard]::SetText($actionFullInstructions)
            $actionStatus.Text = "Instrucciones completas copiadas: $($actionFullInstructions.Length)/8000. Reemplaza todo el campo."
            $actionFullInstructions = $null
        }
        catch { $actionStatus.Text = 'No se pudieron copiar las instrucciones completas. Comprueba su archivo y longitud.' }
    })
    $actionDialog.add_FormClosing({ $actionKeyBox.Clear() })
    [void]$actionDialog.ShowDialog()
    $actionSetupResult = 'closed'
}
catch {
    if ($actionFormsReady) {
        [void][Windows.Forms.MessageBox]::Show('No se pudo abrir el formulario. Comprueba las claves locales y usa PowerShell -STA.', 'Lexiapp · Conectar acción del GPT')
    }
}
finally {
    if ($null -ne $actionKeyBox -and -not $actionKeyBox.IsDisposed) { $actionKeyBox.Clear() }
    if ($null -ne $actionDialog) { $actionDialog.Dispose() }
    if ($actionBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($actionBstr) }
    if ($null -ne $actionSecureContainer) { $actionSecureContainer.Dispose() }
    $actionJson = $null
    $actionContainer = $null
    $actionKey = $null
}

Write-Output $actionSetupResult
