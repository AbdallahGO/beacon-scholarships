# extract_details.ps1 — fetch full bilingual detail content for every catalogue scholarship
# from its stored for9a source URL, per specs/002-scholarship-detail-pages.
#
# Reads : ScholarShips_Data/*.clean.json            (unique id -> url/title)
# Writes: ScholarShips_Data/details/<id>.json       (raw bilingual content, schema in contracts/detail-content.schema.md §1)
#         ScholarShips_Data/details-manifest.json   (per-id status: ok | partial | failed, schema §4)
#
# Usage : .\extract_details.ps1 [-Force] [-Ids 29536,30513] [-DelayMs 500]
#         Resumable: ids already "ok" in the manifest are skipped unless -Force.

[CmdletBinding()]
param(
    [switch]$Force,
    [string[]]$Ids,
    [int]$DelayMs = 500
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$dataDir     = $PSScriptRoot
$detailsDir  = Join-Path $dataDir 'details'
$manifestPath = Join-Path $dataDir 'details-manifest.json'
$utf8NoBom   = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path $detailsDir)) { New-Item -ItemType Directory -Path $detailsDir | Out-Null }

# ---- collect unique catalogue records (first occurrence wins; ids repeat across country files) ----
$records = @{}
Get-ChildItem -Path $dataDir -Filter '*.clean.json' | Sort-Object Name | ForEach-Object {
    $items = Get-Content $_.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($it in $items) {
        if ($it.id -and -not $records.ContainsKey([string]$it.id)) {
            $records[[string]$it.id] = $it
        }
    }
}
if ($records.Count -eq 0) { throw "No records found in $dataDir\*.clean.json" }

# ---- load existing manifest entries (resumability) ----
$entries = @{}
if (Test-Path $manifestPath) {
    $m = Get-Content $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($e in $m.entries) { $entries[[string]$e.id] = $e }
}

# ---- helpers ----
function Get-Opportunity([string]$url) {
    # Arabic slugs need escaping; EscapeUriString is a no-op on plain ASCII URLs
    $escaped = [System.Uri]::EscapeUriString($url)
    try {
        $resp = Invoke-WebRequest -Uri $escaped -UseBasicParsing -TimeoutSec 40
    } catch [System.Net.WebException] {
        # PS 5.1 does not follow 308 Permanent Redirect — follow Location manually (once),
        # but only to another opportunity page; a redirect to the generic listing means
        # the opportunity was removed from for9a.
        $http = $_.Exception.Response
        $loc = if ($http) { $http.Headers['Location'] } else { $null }
        if ($http -and [int]$http.StatusCode -eq 308 -and $loc -match '/opportunity/.+') {
            $resp = Invoke-WebRequest -Uri $loc -UseBasicParsing -TimeoutSec 40
        } elseif ($http -and [int]$http.StatusCode -eq 308) {
            throw "source page removed from for9a (redirects to $loc)"
        } else { throw }
    }
    $m = [regex]::Match($resp.Content, '<script id="__NEXT_DATA__" type="application/json"[^>]*>(.*?)</script>', 'Singleline')
    if (-not $m.Success) { throw "__NEXT_DATA__ not found" }
    $json = $m.Groups[1].Value | ConvertFrom-Json
    $opp = $json.props.pageProps.data.opportunity
    if (-not $opp) { throw "opportunity object missing in page data" }
    return $opp
}

function Get-Sections($opp) {
    $sections = @()
    foreach ($d in @($opp.descriptions)) {
        $body = [string]$d.body
        if ($body -and $body.Trim().Length -gt 0) {
            $sections += [pscustomobject]@{ header = [string]$d.header; body = $body }
        }
    }
    return ,$sections
}

function Get-OfficialLink($opp) {
    # priority: redirect_url -> organization.uni_url -> apply-intent anchor in section bodies.
    # Body anchors are only trusted when their visible text reads like an apply action,
    # otherwise embedded junk links (ads, unrelated references) leak through.
    foreach ($cand in @([string]$opp.redirect_url, [string]$opp.organization.uni_url)) {
        if ($cand -and $cand -match '^https?://' -and $cand -notmatch 'for9a\.com') { return $cand }
    }
    foreach ($d in @($opp.descriptions)) {
        foreach ($am in [regex]::Matches([string]$d.body, '(?is)<a\b[^>]*href="(https?://[^"]+)"[^>]*>(.*?)</a>')) {
            $href = $am.Groups[1].Value
            $text = ($am.Groups[2].Value -replace '<[^>]+>', '').Trim()
            if ($href -match 'for9a\.com|froala\.com') { continue }
            if ($text -match '(?i)\b(apply|application|register|registration|submit)\b|التقديم|التسجيل|قدم|سجل|من هنا') { return $href }
        }
    }
    return $null
}

function Save-Manifest {
    $all = @($entries.Values | Sort-Object { [int]$_.id })
    $totals = [pscustomobject]@{
        ok      = @($all | Where-Object { $_.status -eq 'ok' }).Count
        partial = @($all | Where-Object { $_.status -eq 'partial' }).Count
        failed  = @($all | Where-Object { $_.status -eq 'failed' }).Count
    }
    $manifest = [pscustomobject]@{
        generated_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        totals       = $totals
        entries      = $all
    }
    [System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 6), $utf8NoBom)
}

# ---- choose work set ----
$targetIds = $records.Keys
if ($Ids) { $targetIds = $targetIds | Where-Object { $Ids -contains $_ } }
$targetIds = @($targetIds | Sort-Object { [int]$_ })

$done = 0; $skipped = 0
foreach ($id in $targetIds) {
    $rec = $records[$id]
    $prev = $entries[$id]
    if (-not $Force -and $prev -and $prev.status -eq 'ok') { $skipped++; continue }

    $now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    $en = $null; $ar = $null; $arUrl = $null; $official = $null; $orgAbout = $null; $err = $null

    try {
        $opp = Get-Opportunity ([string]$rec.url)
        $sections = Get-Sections $opp
        if ($sections.Count -gt 0) {
            $en = [pscustomobject]@{ lang = 'en'; title = [string]$opp.title; sections = $sections }
        }
        $official = Get-OfficialLink $opp
        $about = [string]$opp.organization.about
        if ($about -and $about.Trim()) { $orgAbout = $about.Trim() }
        $arUrl = [string]$opp.transUrl
    } catch {
        $err = "EN: $($_.Exception.Message)"
    }

    if ($arUrl) {
        Start-Sleep -Milliseconds $DelayMs
        try {
            $oppAr = Get-Opportunity $arUrl
            $sectionsAr = Get-Sections $oppAr
            if ($sectionsAr.Count -gt 0) {
                $ar = [pscustomobject]@{ lang = 'ar'; title = [string]$oppAr.title; sections = $sectionsAr }
            }
            if (-not $official) { $official = Get-OfficialLink $oppAr }
        } catch {
            $err = if ($err) { "$err; AR: $($_.Exception.Message)" } else { "AR: $($_.Exception.Message)" }
        }
    } elseif (-not $err) {
        $err = 'AR: no transUrl on English page'
    }

    if ($en -and $ar)          { $status = 'ok' }
    elseif ($en -or $ar)       { $status = 'partial' }
    else                       { $status = 'failed' }

    if ($status -ne 'failed') {
        $detail = [pscustomobject]@{
            id            = $id
            status        = $status
            fetched_at    = $now
            official_link = $official
            org_about     = $orgAbout
            en            = $en
            ar            = $ar
        }
        $detailPath = Join-Path $detailsDir "$id.json"
        [System.IO.File]::WriteAllText($detailPath, ($detail | ConvertTo-Json -Depth 6), $utf8NoBom)
    }

    $entries[$id] = [pscustomobject]@{
        id         = $id
        title      = [string]$rec.title
        status     = $status
        en_url     = [string]$rec.url
        ar_url     = $arUrl
        error      = $err
        fetched_at = $now
    }
    Save-Manifest
    $done++
    Write-Host ("[{0}/{1}] {2}  {3}  {4}" -f $done, $targetIds.Count, $id, $status.ToUpper().PadRight(7), [string]$rec.title)
    Start-Sleep -Milliseconds $DelayMs
}

# ---- summary ----
Save-Manifest
$all = @($entries.Values)
$sum = [pscustomobject]@{
    processed = $done
    skipped_ok = $skipped
    ok        = @($all | Where-Object { $_.status -eq 'ok' }).Count
    partial   = @($all | Where-Object { $_.status -eq 'partial' }).Count
    failed    = @($all | Where-Object { $_.status -eq 'failed' }).Count
    total_catalogue_ids = $records.Count
}
Write-Host ""
Write-Host "==== extraction summary ===="
$sum | Format-List | Out-String | Write-Host
$bad = @($all | Where-Object { $_.status -ne 'ok' })
if ($bad.Count -gt 0) {
    Write-Host "non-ok ids:"
    $bad | ForEach-Object { Write-Host ("  {0}  {1}  {2}" -f $_.id, $_.status, $_.error) }
}
