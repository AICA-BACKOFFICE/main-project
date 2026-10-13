# Optional helper for this workspace's portable Java; no global environment changes.
# Forward Maven options without PowerShell common-parameter interpretation.
$taskMavenArguments = $args
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskPreviousJava = $env:JAVA_HOME
$taskPreviousMavenHome = $env:MAVEN_USER_HOME
try {
    if (-not $env:JAVA_HOME) {
        $taskJdkRoot = Join-Path $taskRoot '.tools/jdk'
        if (Test-Path -LiteralPath $taskJdkRoot) {
            $taskJdk = Get-ChildItem -LiteralPath $taskJdkRoot -Directory |
                Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin/java.exe') } |
                Select-Object -First 1
            if ($taskJdk) { $env:JAVA_HOME = $taskJdk.FullName }
        }
    }
    $env:MAVEN_USER_HOME = Join-Path $taskRoot '.cache/maven-user-home'
    Push-Location $taskRoot
    try {
        & (Join-Path $taskRoot 'mvnw.cmd') @taskMavenArguments
        $taskExitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }
} finally {
    $env:JAVA_HOME = $taskPreviousJava
    $env:MAVEN_USER_HOME = $taskPreviousMavenHome
}
exit $taskExitCode
