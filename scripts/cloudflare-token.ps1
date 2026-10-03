[CmdletBinding()]
param(
    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string]$OutputPath = (Join-Path $env:LOCALAPPDATA 'Lexiapp\credentials\cloudflare-stream.xml')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:cfTokenResult = 'cancelled'
$cfDialog = $null
$cfTemporaryFile = $null

function Resolve-CfCredentialTarget {
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
        throw 'El token debe guardarse en una unidad local.'
    }
    foreach ($syncRoot in @($env:OneDrive, $env:OneDriveConsumer, $env:OneDriveCommercial)) {
        if (-not [string]::IsNullOrWhiteSpace($syncRoot)) {
            $syncPath = [IO.Path]::GetFullPath($syncRoot).TrimEnd([char[]]'\/')
            if ($resolved.Equals($syncPath, [StringComparison]::OrdinalIgnoreCase) -or
                $resolved.StartsWith($syncPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
                throw 'El token debe guardarse fuera de OneDrive.'
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
    $cfTargetPath = Resolve-CfCredentialTarget -Candidate $OutputPath

    $cfDialog = [Windows.Forms.Form]::new()
    $cfDialog.Text = 'Lexiapp · Token de Cloudflare Stream'
    $cfDialog.ClientSize = [Drawing.Size]::new(565, 330)
    $cfDialog.StartPosition = [Windows.Forms.FormStartPosition]::CenterScreen
    $cfDialog.FormBorderStyle = [Windows.Forms.FormBorderStyle]::FixedDialog
    $cfDialog.MaximizeBox = $false
    $cfDialog.Font = [Drawing.Font]::new('Segoe UI', 10)

    $cfAccountLabel = [Windows.Forms.Label]::new()
    $cfAccountLabel.Location = [Drawing.Point]::new(24, 20)
    $cfAccountLabel.Size = [Drawing.Size]::new(515, 55)
    $cfAccountLabel.Text = "Cuenta: Yoshiman1989`r`nPermiso requerido: Cuenta → Stream → Editar. Limita el token a esta cuenta."
    $cfDialog.Controls.Add($cfAccountLabel)

    $cfLink = [Windows.Forms.LinkLabel]::new()
    $cfLink.Location = [Drawing.Point]::new(24, 81)
    $cfLink.Size = [Drawing.Size]::new(515, 24)
    $cfLink.Text = 'Crear o administrar el token en Cloudflare'
    $cfLink.add_LinkClicked({
        try { Start-Process -FilePath 'https://dash.cloudflare.com/profile/api-tokens' }
        catch { $cfValidationLabel.Text = 'No se pudo abrir el navegador. Accede a los tokens desde el panel de Cloudflare.' }
    })
    $cfDialog.Controls.Add($cfLink)

    $cfTokenLabel = [Windows.Forms.Label]::new()
    $cfTokenLabel.Location = [Drawing.Point]::new(24, 119)
    $cfTokenLabel.Size = [Drawing.Size]::new(515, 22)
    $cfTokenLabel.Text = 'Token de API de Stream (no introduzcas tu contraseña de Cloudflare):'
    $cfDialog.Controls.Add($cfTokenLabel)

    $cfTokenBox = [Windows.Forms.TextBox]::new()
    $cfTokenBox.Location = [Drawing.Point]::new(24, 146)
    $cfTokenBox.Size = [Drawing.Size]::new(515, 28)
    $cfTokenBox.UseSystemPasswordChar = $true
    $cfTokenBox.MaxLength = 4096
    $cfTokenBox.Name = 'CloudflareStreamToken'
    $cfTokenBox.AccessibleName = 'Token de Cloudflare Stream'
    $cfDialog.Controls.Add($cfTokenBox)

    $cfValidationLabel = [Windows.Forms.Label]::new()
    $cfValidationLabel.Location = [Drawing.Point]::new(24, 183)
    $cfValidationLabel.Size = [Drawing.Size]::new(515, 38)
    $cfValidationLabel.ForeColor = [Drawing.Color]::Firebrick
    $cfDialog.Controls.Add($cfValidationLabel)

    $cfPrivacyLabel = [Windows.Forms.Label]::new()
    $cfPrivacyLabel.Location = [Drawing.Point]::new(24, 225)
    $cfPrivacyLabel.Size = [Drawing.Size]::new(515, 40)
    $cfPrivacyLabel.Text = "Se cifra para tu usuario de Windows y se guarda fuera de OneDrive.`r`nGuardar actualiza el token cifrado si ya existe. Cancelar conserva el actual."
    $cfDialog.Controls.Add($cfPrivacyLabel)

    $cfSave = [Windows.Forms.Button]::new()
    $cfSave.Location = [Drawing.Point]::new(323, 280)
    $cfSave.Size = [Drawing.Size]::new(104, 32)
    $cfSave.Text = 'Guardar'
    $cfDialog.Controls.Add($cfSave)

    $cfCancel = [Windows.Forms.Button]::new()
    $cfCancel.Location = [Drawing.Point]::new(435, 280)
    $cfCancel.Size = [Drawing.Size]::new(104, 32)
    $cfCancel.Text = 'Cancelar'
    $cfCancel.DialogResult = [Windows.Forms.DialogResult]::Cancel
    $cfDialog.Controls.Add($cfCancel)
    $cfDialog.AcceptButton = $cfSave
    $cfDialog.CancelButton = $cfCancel

    $cfSave.add_Click({
        $cfPlainText = $cfTokenBox.Text
        if ([string]::IsNullOrWhiteSpace($cfPlainText) -or $cfPlainText.Length -lt 20 -or $cfPlainText -match '\s') {
            $cfValidationLabel.Text = 'Introduce un token de al menos 20 caracteres, sin espacios ni saltos de linea.'
            $cfPlainText = $null
            [void]$cfTokenBox.Focus()
            return
        }
        $cfSecureToken = $null
        $cfSave.Enabled = $false
        try {
            $cfTargetPath = Resolve-CfCredentialTarget -Candidate $OutputPath
            $cfParent = [IO.Path]::GetDirectoryName($cfTargetPath)
            [void][IO.Directory]::CreateDirectory($cfParent)
            $cfTargetPath = Resolve-CfCredentialTarget -Candidate $cfTargetPath
            $cfTemporaryFile = Join-Path $cfParent ('.cloudflare-stream.' + [Guid]::NewGuid().ToString('N') + '.tmp')
            $cfSecureToken = ConvertTo-SecureString -String $cfPlainText -AsPlainText -Force
            $cfSecureToken | Export-Clixml -LiteralPath $cfTemporaryFile -Depth 3 -Force
            Move-Item -LiteralPath $cfTemporaryFile -Destination $cfTargetPath -Force
            $cfTemporaryFile = $null
            $script:cfTokenResult = 'saved'
            $cfTokenBox.Clear()
            $cfDialog.DialogResult = [Windows.Forms.DialogResult]::OK
            $cfDialog.Close()
        }
        catch { $cfValidationLabel.Text = 'No se pudo guardar el token cifrado. Comprueba la ruta y sus permisos.' }
        finally {
            $cfPlainText = $null
            if ($null -ne $cfSecureToken) { $cfSecureToken.Dispose() }
            if ($null -ne $cfTemporaryFile -and (Test-Path -LiteralPath $cfTemporaryFile)) {
                Remove-Item -LiteralPath $cfTemporaryFile -Force -ErrorAction SilentlyContinue
            }
            $cfTemporaryFile = $null
            if (-not $cfDialog.IsDisposed) { $cfSave.Enabled = $true }
        }
    })
    $cfDialog.add_Shown({ [void]$cfTokenBox.Focus() })
    [void]$cfDialog.ShowDialog()
}
catch {
    if ($null -ne $cfDialog) {
        [void][Windows.Forms.MessageBox]::Show('No se pudo abrir el formulario. Usa PowerShell -STA y una ruta local XML sin enlaces, fuera de OneDrive.', 'Lexiapp · Token de Cloudflare Stream')
    }
}
finally {
    if ($null -ne $cfDialog) { $cfDialog.Dispose() }
}

Write-Output $script:cfTokenResult
