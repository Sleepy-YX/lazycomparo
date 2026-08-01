# JsLiteral.ps1 -- read JavaScript object/array literals from source files.
# ---------------------------------------------------------------------------
# WHY THIS EXISTS
# The catalogs (GAMES, GENRE_BUCKETS, PHONES) live as plain JS literals inside
# single-file apps, and this PC has no Node -- so any tooling that wants to READ
# them has to parse JS itself. This is a deliberately small recursive-descent
# reader for the literal subset those catalogs use:
#
#   objects, arrays, 'single' and "double" quoted strings, numbers,
#   true/false/null, // and /* */ comments, trailing commas,
#   unquoted identifier keys
#
# Anything outside that subset (template literals, expressions, spreads) throws
# with a line number rather than guessing. Loud failure beats a silent
# half-parse in a pre-push check.
#
# The reader keeps its cursor in $script:-scoped state on purpose: PowerShell
# functions may READ a caller's variables but assignment creates a local copy,
# so a nested-function cursor would never advance.
#
# Usage:
#   . "$PSScriptRoot\JsLiteral.ps1"
#   $games = Get-JsLiteral -Path .\games\index.html -Name GAMES
# ---------------------------------------------------------------------------

# NB: no Set-StrictMode here -- this file is dot-sourced, so it would apply to
# the CALLER's scope too. Scripts that want strict mode set it themselves.

$script:JslText = ''
$script:JslLen  = 0
$script:JslPos  = 0

function Read-SourceText {
    # PS 5.1's Get-Content guesses ANSI for BOM-less files, which mangles the
    # curly quotes and em-dashes in the catalogs. Always decode as UTF-8.
    param([Parameter(Mandatory)][string]$Path)
    $full = (Resolve-Path -LiteralPath $Path).ProviderPath
    return [System.IO.File]::ReadAllText($full, (New-Object System.Text.UTF8Encoding($false)))
}

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][AllowEmptyString()][string]$Content
    )
    $dir = Split-Path -Parent $Path
    if ($dir -and -not (Test-Path -LiteralPath $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    # A BOM survives fetch().json() (UTF-8 decode strips it) but shows up as a
    # stray character in every other consumer. Write clean bytes.
    [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

function script:_JslLineNo([int]$pos) {
    if ($pos -gt $script:JslLen) { $pos = $script:JslLen }
    return ($script:JslText.Substring(0, $pos) -split "`n").Count
}

function script:_JslDie([string]$msg, [int]$pos) {
    throw ("JsLiteral parse error at line {0}: {1}" -f (_JslLineNo $pos), $msg)
}

function script:_JslSkipTrivia {
    while ($script:JslPos -lt $script:JslLen) {
        $c = $script:JslText[$script:JslPos]
        if ($c -eq ' ' -or $c -eq "`t" -or $c -eq "`r" -or $c -eq "`n") { $script:JslPos++; continue }
        if ($c -eq '/' -and ($script:JslPos + 1) -lt $script:JslLen) {
            $c2 = $script:JslText[$script:JslPos + 1]
            if ($c2 -eq '/') {
                while ($script:JslPos -lt $script:JslLen -and $script:JslText[$script:JslPos] -ne "`n") { $script:JslPos++ }
                continue
            }
            if ($c2 -eq '*') {
                $end = $script:JslText.IndexOf('*/', $script:JslPos + 2)
                if ($end -lt 0) { _JslDie 'unterminated /* comment' $script:JslPos }
                $script:JslPos = $end + 2
                continue
            }
        }
        break
    }
}

function script:_JslEscape([string]$v) {
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('"')
    foreach ($ch in $v.ToCharArray()) {
        if     ($ch -eq '"')      { [void]$sb.Append('\"') }
        elseif ($ch -eq '\')      { [void]$sb.Append('\\') }
        elseif ($ch -eq "`b")     { [void]$sb.Append('\b') }
        elseif ($ch -eq "`f")     { [void]$sb.Append('\f') }
        elseif ($ch -eq "`n")     { [void]$sb.Append('\n') }
        elseif ($ch -eq "`r")     { [void]$sb.Append('\r') }
        elseif ($ch -eq "`t")     { [void]$sb.Append('\t') }
        elseif ([int]$ch -lt 0x20) { [void]$sb.AppendFormat('\u{0:x4}', [int]$ch) }
        else                      { [void]$sb.Append($ch) }
    }
    [void]$sb.Append('"')
    return $sb.ToString()
}

function script:_JslReadString {
    # Returns the decoded string; leaves the cursor past the closing quote.
    $quote = $script:JslText[$script:JslPos]
    $script:JslPos++
    $sb = New-Object System.Text.StringBuilder
    while ($true) {
        if ($script:JslPos -ge $script:JslLen) { _JslDie 'unterminated string' $script:JslPos }
        $c = $script:JslText[$script:JslPos]
        if ($c -eq $quote) { $script:JslPos++; break }
        if ($c -eq "`n")   { _JslDie 'newline inside string' $script:JslPos }
        if ($c -eq '\') {
            $script:JslPos++
            if ($script:JslPos -ge $script:JslLen) { _JslDie 'unterminated escape' $script:JslPos }
            $e = $script:JslText[$script:JslPos]
            $script:JslPos++
            if     ($e -eq 'n') { [void]$sb.Append("`n") }
            elseif ($e -eq 'r') { [void]$sb.Append("`r") }
            elseif ($e -eq 't') { [void]$sb.Append("`t") }
            elseif ($e -eq 'b') { [void]$sb.Append("`b") }
            elseif ($e -eq 'f') { [void]$sb.Append("`f") }
            elseif ($e -eq 'v') { [void]$sb.Append([char]0x0B) }
            elseif ($e -eq '0') { [void]$sb.Append([char]0) }
            elseif ($e -eq 'u') {
                if (($script:JslPos + 4) -gt $script:JslLen) { _JslDie 'truncated \u escape' $script:JslPos }
                $hex = $script:JslText.Substring($script:JslPos, 4)
                $script:JslPos += 4
                [void]$sb.Append([char][Convert]::ToInt32($hex, 16))
            }
            elseif ($e -eq 'x') {
                if (($script:JslPos + 2) -gt $script:JslLen) { _JslDie 'truncated \x escape' $script:JslPos }
                $hex = $script:JslText.Substring($script:JslPos, 2)
                $script:JslPos += 2
                [void]$sb.Append([char][Convert]::ToInt32($hex, 16))
            }
            # \' \" \\ \/ and anything else: the character itself (JS rule)
            else { [void]$sb.Append($e) }
            continue
        }
        [void]$sb.Append($c)
        $script:JslPos++
    }
    return $sb.ToString()
}

function script:_JslReadValue([int]$depth) {
    _JslSkipTrivia
    if ($script:JslPos -ge $script:JslLen) { _JslDie 'unexpected end of input' $script:JslPos }
    $c = $script:JslText[$script:JslPos]

    if ($c -eq '{') { return _JslReadObject $depth }
    if ($c -eq '[') { return _JslReadArray  $depth }
    if ($c -eq "'" -or $c -eq '"') { return _JslEscape (_JslReadString) }
    if ($c -eq '`') { _JslDie 'template literals are not supported' $script:JslPos }

    $rest = $script:JslText.Substring($script:JslPos)
    $m = [regex]::Match($rest, '^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?')
    if ($m.Success -and $m.Length -gt 0) { $script:JslPos += $m.Length; return $m.Value }

    $k = [regex]::Match($rest, '^(true|false|null)\b')
    if ($k.Success) { $script:JslPos += $k.Length; return $k.Value }

    _JslDie ("unexpected character '{0}'" -f $c) $script:JslPos
}

function script:_JslReadArray([int]$depth) {
    $script:JslPos++   # consume [
    $items = New-Object System.Collections.ArrayList
    $allScalar = $true
    while ($true) {
        _JslSkipTrivia
        if ($script:JslPos -ge $script:JslLen) { _JslDie 'unterminated array' $script:JslPos }
        if ($script:JslText[$script:JslPos] -eq ']') { $script:JslPos++; break }

        $v = _JslReadValue ($depth + 1)
        if ($v.StartsWith('{') -or $v.StartsWith('[')) { $allScalar = $false }
        [void]$items.Add($v)

        _JslSkipTrivia
        if ($script:JslPos -lt $script:JslLen -and $script:JslText[$script:JslPos] -eq ',') { $script:JslPos++; continue }
        if ($script:JslPos -lt $script:JslLen -and $script:JslText[$script:JslPos] -eq ']') { $script:JslPos++; break }
        _JslDie 'expected , or ] in array' $script:JslPos
    }
    if ($items.Count -eq 0) { return '[]' }

    # Arrays of plain values (pros, tags, ...) stay on one line while they fit --
    # one string per line would triple the file for no readability win.
    if ($allScalar) {
        $inline = '[' + ($items -join ', ') + ']'
        if (($inline.Length + $depth * 2) -le 110) { return $inline }
    }
    $pad  = '  ' * ($depth + 1)
    $cpad = '  ' * $depth
    return "[`n" + $pad + ($items -join (",`n" + $pad)) + "`n" + $cpad + ']'
}

function script:_JslReadObject([int]$depth) {
    $script:JslPos++   # consume {
    $pairs = New-Object System.Collections.ArrayList
    while ($true) {
        _JslSkipTrivia
        if ($script:JslPos -ge $script:JslLen) { _JslDie 'unterminated object' $script:JslPos }
        if ($script:JslText[$script:JslPos] -eq '}') { $script:JslPos++; break }

        $c = $script:JslText[$script:JslPos]
        if ($c -eq "'" -or $c -eq '"') {
            $key = _JslReadString
        } else {
            $km = [regex]::Match($script:JslText.Substring($script:JslPos), '^[A-Za-z_$][A-Za-z0-9_$]*')
            if (-not $km.Success) { _JslDie 'expected a property name' $script:JslPos }
            $key = $km.Value
            $script:JslPos += $km.Length
        }

        _JslSkipTrivia
        if ($script:JslPos -ge $script:JslLen -or $script:JslText[$script:JslPos] -ne ':') {
            _JslDie ("expected ':' after key '{0}'" -f $key) $script:JslPos
        }
        $script:JslPos++
        $val = _JslReadValue ($depth + 1)
        [void]$pairs.Add(((_JslEscape $key) + ': ' + $val))

        _JslSkipTrivia
        if ($script:JslPos -lt $script:JslLen -and $script:JslText[$script:JslPos] -eq ',') { $script:JslPos++; continue }
        if ($script:JslPos -lt $script:JslLen -and $script:JslText[$script:JslPos] -eq '}') { $script:JslPos++; break }
        _JslDie 'expected , or } in object' $script:JslPos
    }
    if ($pairs.Count -eq 0) { return '{}' }
    $pad  = '  ' * ($depth + 1)
    $cpad = '  ' * $depth
    return "{`n" + $pad + ($pairs -join (",`n" + $pad)) + "`n" + $cpad + '}'
}

function ConvertTo-JsonFromJsLiteral {
    <#
      .SYNOPSIS Translate a JS literal into pretty-printed JSON text.
      .PARAMETER Text   Source containing the literal.
      .PARAMETER Start  Index at (or before) the opening [ or {.
    #>
    param(
        [Parameter(Mandatory)][string]$Text,
        [int]$Start = 0
    )
    $script:JslText = $Text
    $script:JslLen  = $Text.Length
    $script:JslPos  = $Start
    $json = _JslReadValue 0
    # Callers splice the source around the literal, so publish where it ended.
    $script:JsLiteralEndIndex = $script:JslPos
    return $json
}

function Get-JsLiteralBounds {
    <#
      .SYNOPSIS Locate `const NAME = <literal>` in source text.
      .OUTPUTS  Json, DeclStart (index of const/let/var), ValueStart,
                ValueEnd (exclusive) and the raw literal Text.
    #>
    param(
        [Parameter(Mandatory)][string]$Text,
        [Parameter(Mandatory)][string]$Name
    )
    $pattern = '(?m)^[ \t]*(?:const|let|var)[ \t]+' + [regex]::Escape($Name) + '[ \t]*=[ \t]*'
    $decl = [regex]::Match($Text, $pattern)
    if (-not $decl.Success) { throw "Declaration '$Name' not found." }

    $valueStart = $decl.Index + $decl.Length
    $json = ConvertTo-JsonFromJsLiteral -Text $Text -Start $valueStart
    return [pscustomobject]@{
        Name       = $Name
        Json       = $json
        DeclStart  = $decl.Index
        ValueStart = $valueStart
        ValueEnd   = $script:JsLiteralEndIndex
        Text       = $Text.Substring($valueStart, $script:JsLiteralEndIndex - $valueStart)
    }
}

function Get-JsLiteral {
    <#
      .SYNOPSIS Parse `const NAME = ...` out of a file into PowerShell objects.
    #>
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Name
    )
    $text = Read-SourceText -Path $Path
    $b = Get-JsLiteralBounds -Text $text -Name $Name
    # Bind to a variable before returning. PS 5.1's ConvertFrom-Json emits an
    # array as ONE pipeline item, so `return ... | ConvertFrom-Json` would make
    # @(Get-JsLiteral ...) a nested 1-element array at the call site. Returning
    # the variable enumerates normally, so callers can wrap in @() safely.
    $parsed = $b.Json | ConvertFrom-Json
    return $parsed
}
