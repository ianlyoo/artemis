# Install Artemis for this user on Windows (no administrator):
#   irm https://raw.githubusercontent.com/ianlyoo/artemis/main/install.ps1 | iex
# It needs Python 3.11 or newer and Git. It installs with pipx (set up for this user with pip when missing) and
# fetches nothing else but the package. $env:ARTEMIS_INSTALL_SOURCE installs another source (a checkout, a tag).
# It runs inside a script block, so piping it into iex leaves nothing behind in your session but PATH.

& {
    # Native programs report through exit codes; 'Stop' would turn their stderr into errors in Windows PowerShell.
    $ErrorActionPreference = 'Continue'
    $source = if ($env:ARTEMIS_INSTALL_SOURCE) { $env:ARTEMIS_INSTALL_SOURCE } else {
        'git+https://github.com/ianlyoo/artemis' }

    $python = $null
    foreach ($candidate in @(@{ Name = 'py'; Args = @('-3') }, @{ Name = 'python'; Args = @() },
                             @{ Name = 'python3'; Args = @() })) {
        $found = Get-Command $candidate.Name -CommandType Application -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if (-not $found) { continue }
        $prefix = $candidate.Args
        # No double quotes inside arguments: Windows PowerShell 5.1 drops them on the way to a native program.
        $exe = & $found.Source @prefix -c 'import sys; sys.version_info >= (3, 11) and print(sys.executable)' 2>$null
        if ($LASTEXITCODE -eq 0 -and $exe) { $python = "$exe".Trim(); break }
    }
    if (-not $python) {
        throw ('Python 3.11 or newer is needed. Install it for this user with: ' +
               'winget install --id Python.Python.3.13 -e --scope user   Then open a new PowerShell and run this again.')
    }
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw 'Git is needed. Install it with: winget install --id Git.Git -e   Then open a new PowerShell and run this again.'
    }
    Write-Host "Using Python $(& $python -c 'import sys; print(sys.version.split()[0])') at $python"

    & $python -m pipx --version *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Setting up pipx for this user (python -m pip install --user pipx)'
        & $python -m pip install --user --quiet pipx
        if ($LASTEXITCODE -ne 0) { throw 'pip could not install pipx; see the message above.' }
    }
    & $python -m pipx install --force --python $python $source
    if ($LASTEXITCODE -ne 0) { throw 'pipx could not install Artemis; see the message above.' }
    $bin = (& $python -m pipx environment --value PIPX_BIN_DIR | Out-String).Trim()

    Write-Host ''
    if (-not (Get-Command artemis -ErrorAction SilentlyContinue)) {
        $env:Path = $bin + [IO.Path]::PathSeparator + $env:Path
        & $python -m pipx ensurepath *> $null
        if ($LASTEXITCODE -eq 0) { Write-Host "Added $bin to your PATH, for this window and new ones." }
        else { Write-Host "Added $bin to your PATH for this window. For new windows, run: & '$python' -m pipx ensurepath" }
    }
    & artemis doctor
    if ($LASTEXITCODE -ne 0) { Write-Host 'artemis doctor found something to fix; it says what above.' }
    Write-Host ''
    Write-Host 'Artemis is installed. Try it: artemis demo    Start your home: artemis serve'
    Write-Host "Remove it: & '$python' -m pipx uninstall artemis-harness"
}
