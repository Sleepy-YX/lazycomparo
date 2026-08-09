# Tiny static file server built on System.Net.HttpListener.
# Usage: powershell -ExecutionPolicy Bypass -File serve.ps1 <port> <rootDir>
param(
    [int]$Port = 5173,
    [string]$Root = (Get-Location).Path
)

$Root = (Resolve-Path -LiteralPath $Root).Path
$prefix = "http://127.0.0.1:$Port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Serving $Root at $prefix"

$mime = @{
    ".html"="text/html; charset=utf-8"; ".htm"="text/html; charset=utf-8";
    ".js"="application/javascript; charset=utf-8"; ".mjs"="application/javascript; charset=utf-8";
    ".css"="text/css; charset=utf-8"; ".json"="application/json; charset=utf-8";
    ".png"="image/png"; ".jpg"="image/jpeg"; ".jpeg"="image/jpeg"; ".gif"="image/gif";
    ".svg"="image/svg+xml"; ".ico"="image/x-icon"; ".woff"="font/woff"; ".woff2"="font/woff2";
    ".txt"="text/plain; charset=utf-8"; ".map"="application/json";
    ".webmanifest"="application/manifest+json"; ".xml"="application/xml; charset=utf-8"
}

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response
        try {
            $urlPath = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
            if ($urlPath -eq "/" -or $urlPath -eq "") { $urlPath = "/index.html" }
            $relative = $urlPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
            $fullPath = [System.IO.Path]::GetFullPath((Join-Path $Root $relative))
            if (-not $fullPath.StartsWith($Root, [System.StringComparison]::OrdinalIgnoreCase)) {
                $res.StatusCode = 403; $res.Close(); continue
            }
            # Resolve the way Cloudflare Pages does, or pages that work in
            # production 404 locally: exact file first, then <path>.html (this
            # is what serves /about and /how-we-rank without a trailing slash),
            # then a directory's index.html (/gog, /deals/all-time-low).
            if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
                $asHtml = $fullPath + ".html"
                if (Test-Path -LiteralPath $asHtml -PathType Leaf) {
                    $fullPath = $asHtml
                } elseif (Test-Path -LiteralPath $fullPath -PathType Container) {
                    $fullPath = Join-Path $fullPath "index.html"
                }
            }
            if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
                # Pages serves the project's own 404.html with a 404 status.
                $notFound = Join-Path $Root "404.html"
                $res.StatusCode = 404
                if (Test-Path -LiteralPath $notFound -PathType Leaf) {
                    $res.ContentType = "text/html; charset=utf-8"
                    $bytes = [System.IO.File]::ReadAllBytes($notFound)
                } else {
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $urlPath")
                }
                $res.ContentLength64 = $bytes.Length
                $res.OutputStream.Write($bytes, 0, $bytes.Length)
                Write-Host "$($req.HttpMethod) $urlPath -> 404"
                $res.Close(); continue
            }
            $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
            $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
            $res.Headers.Add("Cache-Control", "no-cache")
            $bytes = [System.IO.File]::ReadAllBytes($fullPath)
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host "$($req.HttpMethod) $urlPath -> 200 ($($bytes.Length) bytes)"
            $res.Close()
        } catch {
            Write-Host "Error handling $($req.Url): $_"
            try { $res.StatusCode = 500; $res.Close() } catch {}
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
