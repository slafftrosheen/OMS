$files = Get-ChildItem -Path .\src -Filter *.svelte -Recurse
$utf8NoBom = New-Object -TypeName System.Text.UTF8Encoding -ArgumentList $false
$modifiedCount = 0

foreach ($file in $files) {
    $path = $file.FullName
    $content = [System.IO.File]::ReadAllText($path)
    $original = $content

    # Fix bubble() calls
    $content = $content.Replace("onclick={stopPropagation(bubble('click'))}", "onclick={(e) => e.stopPropagation()}")
    $content = $content.Replace("onclick={stopPropagation(bubble('click'))} ", "onclick={(e) => e.stopPropagation()} ")
    $content = $content.Replace('onclick={stopPropagation(bubble("click"))}', "onclick={(e) => e.stopPropagation()}")
    $content = $content.Replace("onkeydown={stopPropagation(bubble('keydown'))}", "onkeydown={(e) => e.stopPropagation()}")

    # Add missing svelte/legacy imports if needed
    $hasPreventDefault = $content -match "\{\s*preventDefault\(" -or $content -match "=\s*preventDefault\("
    $hasStopProp = $content -match "\{\s*stopPropagation\(" -or $content -match "=\s*stopPropagation\("

    if ($hasPreventDefault -or $hasStopProp) {
        $imports = @()
        if ($hasPreventDefault -and -not ($content -match "preventDefault\s*\}\s*from\s*['`]svelte/legacy['`]")) {
            $imports += "preventDefault"
        }
        if ($hasStopProp -and -not ($content -match "stopPropagation\s*\}\s*from\s*['`]svelte/legacy['`]")) {
            $imports += "stopPropagation"
        }

        if ($imports.Count -gt 0) {
            $importStr = $imports -join ", "
            $importStmt = "`n  import { $importStr } from 'svelte/legacy';"
            
            if ($content -match "<script lang=`"ts`">") {
                $content = $content -replace '<script lang="ts">', "<script lang=`"ts`">$importStmt"
            } elseif ($content -match "<script>") {
                $content = $content -replace '<script>', "<script>$importStmt"
            } else {
                $content = "<script lang=`"ts`">$importStmt`n</script>`n`n" + $content
            }
        }
    }

    if ($content -cne $original) {
        [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
        Write-Host "Fixed: $path"
        $modifiedCount++
    }
}

Write-Host "Successfully fixed $modifiedCount files."
