# build_details.ps1 - turn raw extracted detail JSON into browser-loadable per-id JS files.
# Sanitizes section HTML per contracts/detail-content.schema.md section 3 and enforces the
# FR-005 gate: no for9a.com href may survive into the generated files.
#
# Reads : ScholarShips_Data/details/*.json, ../scholarships.js (id validation)
# Writes: ../details/<id>.js  ->  window.__SCHOLARSHIP_DETAIL_CB({...})

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$dataDir    = $PSScriptRoot
$rawDir     = Join-Path $dataDir 'details'
$repoRoot   = Split-Path $dataDir -Parent
$outDir     = Join-Path $repoRoot 'details'
$cataloguePath = Join-Path $repoRoot 'scholarships.js'

if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

# ---- catalogue ids for validation ----
$catalogueIds = @{}
if (Test-Path $cataloguePath) {
    foreach ($m in [regex]::Matches((Get-Content $cataloguePath -Raw -Encoding UTF8), '"id":\s*"(\d+)"')) {
        $catalogueIds[$m.Groups[1].Value] = $true
    }
} else {
    Write-Warning "scholarships.js not found - skipping catalogue id validation"
}

$allowedTags = 'p|h[1-4]|ul|ol|li|strong|em|b|i|a|br|div|span|table|tr|td|th|blockquote'

function Sanitize-Body([string]$html) {
    $s = $html
    # drop script/style/iframe blocks and img tags entirely
    $s = [regex]::Replace($s, '(?is)<(script|style|iframe)\b.*?</\1\s*>', '')
    $s = [regex]::Replace($s, '(?is)<(script|style|iframe)\b[^>]*/?>', '')
    $s = [regex]::Replace($s, '(?is)<img\b[^>]*/?>', '')
    # unwrap anchors that are not absolute http(s) to a non-for9a host (incl. relative and for9a links)
    $s = [regex]::Replace($s, '(?is)<a\b(?![^>]*href="https?://)[^>]*>(.*?)</a\s*>', '$1')
    $s = [regex]::Replace($s, '(?is)<a\b[^>]*href="https?://[^"]*for9a\.com[^"]*"[^>]*>(.*?)</a\s*>', '$1')
    # normalize kept anchors: href only, forced new-tab + noopener
    $s = [regex]::Replace($s, '(?is)<a\b[^>]*href="(https?://[^"]+)"[^>]*>', '<a href="$1" target="_blank" rel="noopener">')
    # strip event handlers, inline styles, classes, data-* (double- and single-quoted)
    $s = [regex]::Replace($s, '(?i)\s(?:on\w+|style|class|data-[\w-]+)\s*=\s*"[^"]*"', '')
    $s = [regex]::Replace($s, "(?i)\s(?:on\w+|style|class|data-[\w-]+)\s*=\s*'[^']*'", '')
    # unwrap any element not on the allow-list (keep inner text)
    $s = [regex]::Replace($s, "(?is)</?(?!(?:$allowedTags)\b)[a-z][\w-]*(?:\s[^>]*)?>", '')
    return $s.Trim()
}

# ---- US7 / FR-027-028: scrub visible "For9a" (English) and the Arabic brand word
# "Forsa" from rendered section text/headers/titles/org_about. Arabic glyphs are
# built from hex code points at runtime so this SOURCE file stays pure ASCII (no
# UTF-8 BOM needed under PS 5.1). RTL stays intact because we delete only the brand
# token (with any attached prefix/article) and tidy whitespace.
$brandWord   = -join [char[]](0x0641,0x0631,0x0635,0x0629)            # Forsa (the brand word)
$brandPrep   = -join [char[]](0x0639,0x0644,0x0649)                   # "on"  (precedes the brand)
$arArticle   = -join [char[]](0x0627,0x0644)                          # "the" article
$arPrefixes  = -join [char[]](0x0648,0x0641,0x0628,0x0643,0x0644)     # conj/prep prefixes w f b k l
$arPunct     = -join [char[]](0x060C,0x061B)                          # Arabic comma + semicolon
$script:reBrandPrep = $brandPrep + '\s+' + $brandWord                 # "on Forsa"
$script:reBrandWord = '[' + $arPrefixes + ']*(?:' + $arArticle + ')?' + $brandWord
$script:rePunctFix  = '\s+([.,;:!?' + $arPunct + '])'
$script:reBrandLeft = '(?i)for9a|' + $brandWord                       # residual-brand detector

function Remove-Brand([string]$t) {
    if ([string]::IsNullOrEmpty($t)) { return $t }
    $s = $t
    # English: drop a leading connector + brand first ("on/via For9a"), then any token
    $s = [regex]::Replace($s, '(?i)\b(?:on|via|at|through|from|with)\s+for9a\b', '')
    $s = [regex]::Replace($s, '(?i)for9a', '')
    # Arabic: drop "<prep> <word>" ("on Forsa") first, then the word with any attached prefix/article
    $s = [regex]::Replace($s, $script:reBrandPrep, '')
    $s = [regex]::Replace($s, $script:reBrandWord, '')
    # tidy: strip any inline/block tags left empty, collapse spaces, fix space-before-punct
    $s = [regex]::Replace($s, '(?is)<(strong|em|b|i|span|a)\b[^>]*>\s*</\1>', '')
    $s = [regex]::Replace($s, '(?is)<(p|li|h[1-4]|blockquote)\b[^>]*>\s*</\1>', '')
    $s = [regex]::Replace($s, '[ \t]{2,}', ' ')
    $s = [regex]::Replace($s, $script:rePunctFix, '$1')
    return $s.Trim()
}

$rawFiles = @(Get-ChildItem -Path $rawDir -Filter '*.json' | Sort-Object { [int]$_.BaseName })
if ($rawFiles.Count -eq 0) { throw "No raw detail files in $rawDir - run extract_details.ps1 first" }

$violations = @(); $built = 0
foreach ($f in $rawFiles) {
    $detail = Get-Content $f.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    $id = [string]$detail.id

    if ($id -ne $f.BaseName) { $violations += "id mismatch: file $($f.Name) contains id $id"; continue }
    if ($catalogueIds.Count -gt 0 -and -not $catalogueIds.ContainsKey($id)) {
        $violations += "id $id not present in scholarships.js catalogue"; continue
    }

    foreach ($langKey in @('en', 'ar')) {
        $content = $detail.$langKey
        if ($null -eq $content) { continue }
        # US7: scrub visible brand from the displayed title
        if ($null -ne $content.title) { $content.title = Remove-Brand ([string]$content.title) }
        foreach ($sec in @($content.sections)) {
            $sec.body = Sanitize-Body ([string]$sec.body)
            # FR-005 gate checks the URL host (for9a in a query param of another site is fine)
            if ($sec.body -match 'href="(https?:)?//[^/"]*for9a\.' -or $sec.body -match 'href="(?!https?://)') {
                $violations += "FR-005: for9a/relative href survived sanitization in id $id ($langKey/$($sec.header))"
            }
            # US7: scrub visible brand from rendered body + header (FR-027/028)
            $sec.body = Remove-Brand ([string]$sec.body)
            if ($null -ne $sec.header) { $sec.header = Remove-Brand ([string]$sec.header) }
            # FR-027 gate: no visible brand token may survive into the generated text
            if ($sec.body -match $script:reBrandLeft -or ([string]$sec.header) -match $script:reBrandLeft) {
                $violations += "FR-027: visible brand token survived in id $id ($langKey/$($sec.header))"
            }
        }
        if (([string]$content.title) -match $script:reBrandLeft) {
            $violations += "FR-027: visible brand token survived in title of id $id ($langKey)"
        }
    }

    # US7: scrub the "About the organization" blurb shown on the detail page
    if ($null -ne $detail.org_about) {
        $detail.org_about = Remove-Brand ([string]$detail.org_about)
        if (([string]$detail.org_about) -match $script:reBrandLeft) {
            $violations += "FR-027: visible brand token survived in org_about of id $id"
        }
    }

    # official_link must be an absolute non-for9a http(s) URL, else null
    $link = [string]$detail.official_link
    if (-not ($link -match '^https?://') -or $link -match 'for9a\.com') { $detail.official_link = $null }

    # ConvertTo-Json (PS 5.1) leaves non-ASCII raw - escape it ourselves so the
    # payload is ASCII-safe regardless of how a server/browser guesses the charset
    $json = $detail | ConvertTo-Json -Depth 6 -Compress
    $json = [regex]::Replace($json, '[^\x00-\x7F]', { param($m) '\u{0:x4}' -f [int][char]$m.Value })
    $js = "window.__SCHOLARSHIP_DETAIL_CB && window.__SCHOLARSHIP_DETAIL_CB($json);"
    [System.IO.File]::WriteAllText((Join-Path $outDir "$id.js"), $js, [System.Text.Encoding]::ASCII)
    $built++
}

Write-Host ("built {0} of {1} detail files into {2}" -f $built, $rawFiles.Count, $outDir)
if ($violations.Count -gt 0) {
    Write-Host "VALIDATION FAILURES:" -ForegroundColor Red
    $violations | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}
Write-Host "all validations passed (no for9a hrefs, no visible brand tokens, ids consistent)"
