<#
Flujo documentado antes de implementar:
Abrir la ventana enmascarada → crear una clave en Google AI Studio o aportar una
existente → Guardar valida clave y ruta → cifra con DPAPI del usuario de Windows
fuera de OneDrive → devuelve saved. Cancelar conserva el archivo y devuelve
cancelled. Este formulario no realiza llamadas a Gemini ni imprime la clave.
#>

[CmdletBinding()]
param(
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$OutputPath = (Join-Path $env:LOCALAPPDATA 'Lexiapp\credentials\gemini-api.xml')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:geminiTokenResult = 'cancelled'
$geminiDialog = $null
$geminiTemporaryFile = $null

function Resolve-GeminiCredentialTarget {
    param([Parameter(Mandatory)][string]$Candidate)

    if (-not [IO.Path]::IsPathRooted($Candidate) -or $Candidate -notmatch '^[A-Za-z]:[\\/]') {
        throw 'La ruta debe ser absoluta y pertenecer a una unidad local.'
    }
    $resolved = [IO.Path]::GetFullPath($Candidate)
    if ([IO.Path]::GetExtension($resolved) -ne '.xml') {
        throw 'El archivo cifrado debe tener extension XML.'
    }
    $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($resolved))
    if ($drive.DriveType -eq [IO.DriveType]::Network) {
        throw 'La clave debe guardarse en una unidad local.'
    }
    foreach ($syncRoot in @($env:OneDrive, $env:OneDriveConsumer, $env:OneDriveCommercial)) {
        if (-not [string]::IsNullOrWhiteSpace($syncRoot)) {
            $syncPath = [IO.Path]::GetFullPath($syncRoot).TrimEnd([char[]]'\/')
            if ($resolved.Equals($syncPath, [StringComparison]::OrdinalIgnoreCase) -or
                $resolved.StartsWith($syncPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
                throw 'La clave debe guardarse fuera de OneDrive.'
            }
        }
    }
    $ancestor = $resolved
    while (-not [string]::IsNullOrWhiteSpace($ancestor)) {
        if (Test-Path -LiteralPath $ancestor) {
            $item = Get-Item -LiteralPath $ancestor -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                throw 'La ruta no puede contener enlaces ni puntos de redireccion.'
            }
            if ($ancestor -eq $resolved -and $item.PSIsContainer) {
                throw 'El destino debe ser un archivo XML.'
            }
        }
        $ancestor = [IO.Path]::GetDirectoryName($ancestor)
    }
    return $resolved
}

try {
    if ($env:OS -ne 'Windows_NT') { throw 'Este formulario requiere Windows y cifrado DPAPI.' }
    if ([Threading.Thread]::CurrentThread.GetApartmentState() -ne [Threading.ApartmentState]::STA) {
        throw 'Ejecuta este formulario con PowerShell -STA.'
    }
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    [Windows.Forms.Application]::EnableVisualStyles()
    $geminiTargetPath = Resolve-GeminiCredentialTarget -Candidate $OutputPath

    $geminiDialog = [Windows.Forms.Form]::new()
    $geminiDialog.Text = 'Lexiapp · API key de Gemini'
    $geminiDialog.ClientSize = [Drawing.Size]::new(565, 330)
    $geminiDialog.StartPosition = [Windows.Forms.FormStartPosition]::CenterScreen
    $geminiDialog.FormBorderStyle = [Windows.Forms.FormBorderStyle]::FixedDialog
    $geminiDialog.MaximizeBox = $false
    $geminiDialog.Font = [Drawing.Font]::new('Segoe UI', 10)

    $geminiAccountLabel = [Windows.Forms.Label]::new()
    $geminiAccountLabel.Location = [Drawing.Point]::new(24, 20)
    $geminiAccountLabel.Size = [Drawing.Size]::new(515, 55)
    $geminiAccountLabel.Text = "Google AI Studio · Gemini`r`nUsa una clave del proyecto de Google que deseas utilizar para las pruebas."
    $geminiDialog.Controls.Add($geminiAccountLabel)

    $geminiLink = [Windows.Forms.LinkLabel]::new()
    $geminiLink.Location = [Drawing.Point]::new(24, 81)
    $geminiLink.Size = [Drawing.Size]::new(515, 24)
    $geminiLink.Text = 'Crear o administrar la API key en Google AI Studio'
    $geminiLink.add_LinkClicked({
        try { Start-Process -FilePath 'https://aistudio.google.com/api-keys' }
        catch { $geminiValidationLabel.Text = 'No se pudo abrir el navegador. Accede a las API keys desde Google AI Studio.' }
    })
    $geminiDialog.Controls.Add($geminiLink)

    $geminiTokenLabel = [Windows.Forms.Label]::new()
    $geminiTokenLabel.Location = [Drawing.Point]::new(24, 119)
    $geminiTokenLabel.Size = [Drawing.Size]::new(515, 22)
    $geminiTokenLabel.Text = 'API key de Gemini (no introduzcas tu contraseña de Google):'
    $geminiDialog.Controls.Add($geminiTokenLabel)

    $geminiTokenBox = [Windows.Forms.TextBox]::new()
    $geminiTokenBox.Location = [Drawing.Point]::new(24, 146)
    $geminiTokenBox.Size = [Drawing.Size]::new(515, 28)
    $geminiTokenBox.UseSystemPasswordChar = $true
    $geminiTokenBox.MaxLength = 4096
    $geminiTokenBox.Name = 'GeminiApiKey'
    $geminiTokenBox.AccessibleName = 'API key de Gemini'
    $geminiDialog.Controls.Add($geminiTokenBox)

    $geminiValidationLabel = [Windows.Forms.Label]::new()
    $geminiValidationLabel.Location = [Drawing.Point]::new(24, 183)
    $geminiValidationLabel.Size = [Drawing.Size]::new(515, 38)
    $geminiValidationLabel.ForeColor = [Drawing.Color]::Firebrick
    $geminiDialog.Controls.Add($geminiValidationLabel)

    $geminiPrivacyLabel = [Windows.Forms.Label]::new()
    $geminiPrivacyLabel.Location = [Drawing.Point]::new(24, 225)
    $geminiPrivacyLabel.Size = [Drawing.Size]::new(515, 40)
    $geminiPrivacyLabel.Text = "Se cifra para tu usuario de Windows y se guarda fuera de OneDrive.`r`nGuardar actualiza la clave cifrada si ya existe. Cancelar conserva el actual."
    $geminiDialog.Controls.Add($geminiPrivacyLabel)

    $geminiSave = [Windows.Forms.Button]::new()
    $geminiSave.Location = [Drawing.Point]::new(323, 280)
    $geminiSave.Size = [Drawing.Size]::new(104, 32)
    $geminiSave.Text = 'Guardar'
    $geminiDialog.Controls.Add($geminiSave)

    $geminiCancel = [Windows.Forms.Button]::new()
    $geminiCancel.Location = [Drawing.Point]::new(435, 280)
    $geminiCancel.Size = [Drawing.Size]::new(104, 32)
    $geminiCancel.Text = 'Cancelar'
    $geminiCancel.DialogResult = [Windows.Forms.DialogResult]::Cancel
    $geminiDialog.Controls.Add($geminiCancel)
    $geminiDialog.AcceptButton = $geminiSave
    $geminiDialog.CancelButton = $geminiCancel

    $geminiSave.add_Click({
        $geminiPlainText = $geminiTokenBox.Text
        if ([string]::IsNullOrWhiteSpace($geminiPlainText) -or $geminiPlainText.Length -lt 20 -or $geminiPlainText -match '\s') {
            $geminiValidationLabel.Text = 'Introduce una API key de al menos 20 caracteres, sin espacios ni saltos de línea.'
            $geminiPlainText = $null
            [void]$geminiTokenBox.Focus()
            return
        }
        $geminiSecureToken = $null
        $geminiSave.Enabled = $false
        try {
            $geminiTargetPath = Resolve-GeminiCredentialTarget -Candidate $OutputPath
            $geminiParent = [IO.Path]::GetDirectoryName($geminiTargetPath)
            [void][IO.Directory]::CreateDirectory($geminiParent)
            $geminiTargetPath = Resolve-GeminiCredentialTarget -Candidate $geminiTargetPath
            $geminiTemporaryFile = Join-Path $geminiParent ('.gemini-api.' + [Guid]::NewGuid().ToString('N') + '.tmp')
            $geminiSecureToken = ConvertTo-SecureString -String $geminiPlainText -AsPlainText -Force
            $geminiSecureToken | Export-Clixml -LiteralPath $geminiTemporaryFile -Depth 3 -Force
            Move-Item -LiteralPath $geminiTemporaryFile -Destination $geminiTargetPath -Force
            $geminiTemporaryFile = $null
            $script:geminiTokenResult = 'saved'
            $geminiTokenBox.Clear()
            $geminiDialog.DialogResult = [Windows.Forms.DialogResult]::OK
            $geminiDialog.Close()
        }
        catch { $geminiValidationLabel.Text = 'No se pudo guardar la clave cifrada. Comprueba la ruta y sus permisos.' }
        finally {
            $geminiPlainText = $null
            if ($null -ne $geminiSecureToken) { $geminiSecureToken.Dispose() }
            if ($null -ne $geminiTemporaryFile -and (Test-Path -LiteralPath $geminiTemporaryFile)) {
                Remove-Item -LiteralPath $geminiTemporaryFile -Force -ErrorAction SilentlyContinue
            }
            $geminiTemporaryFile = $null
            if (-not $geminiDialog.IsDisposed) { $geminiSave.Enabled = $true }
        }
    })
    $geminiDialog.add_Shown({ [void]$geminiTokenBox.Focus() })
    [void]$geminiDialog.ShowDialog()
}
catch {
    if ($null -ne $geminiDialog) {
        [void][Windows.Forms.MessageBox]::Show('No se pudo abrir el formulario. Usa PowerShell -STA y una ruta local XML sin enlaces, fuera de OneDrive.', 'Lexiapp · API key de Gemini')
    }
}
finally {
    if ($null -ne $geminiDialog) { $geminiDialog.Dispose() }
}

Write-Output $script:geminiTokenResult
