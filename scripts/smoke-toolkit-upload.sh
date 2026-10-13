#!/usr/bin/env bash
# Read/write smoke check of the authenticated Toolkit upload/download contracts.
# Intentionally retains the uploaded file for Canvas recovery/preview verification.
# Run against a disposable board, not a production customer project.
set -euo pipefail

: "${OMS_BASE_URL:?Set OMS_BASE_URL (e.g. https://oms.example.com)}"
: "${OMS_BOARD_ID:?Set OMS_BOARD_ID to a disposable Toolkit board UUID}"
: "${OMS_COOKIE_JAR:?Set OMS_COOKIE_JAR to an authenticated curl Netscape cookie file}"
: "${OMS_TEST_FILE:?Set OMS_TEST_FILE to a small PNG, JPEG, WebP, GIF or PDF}"

if [[ ! "$OMS_BOARD_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
  echo 'OMS_BOARD_ID is not a UUID' >&2; exit 2
fi
for app in curl python3 sha256sum; do
  command -v "$app" >/dev/null || { echo "Missing ${app}" >&2; exit 2; }
done
[[ -r "$OMS_TEST_FILE" ]] || { echo 'OMS_TEST_FILE is not readable' >&2; exit 2; }
[[ -r "$OMS_COOKIE_JAR" ]] || { echo 'OMS_COOKIE_JAR is not readable' >&2; exit 2; }
base="${OMS_BASE_URL%/}/api/toolkit/assets/${OMS_BOARD_ID}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
echo "Checking upload prerequisites on ${OMS_BASE_URL%/}..."
curl --fail-with-body --silent --show-error --max-time 30 \
  --cookie "$OMS_COOKIE_JAR" -H 'Accept: application/json' \
  "$base" -o "$work/capacity.json"
python3 - "$work/capacity.json" <<'PY'
import json,sys
x=json.load(open(sys.argv[1]))
if x.get('ready') is not True:
    raise SystemExit('Upload not ready: '+str(x.get('error',x)))
print('API preflight ready; declared maximum:',x.get('maximumFileBytes'),'bytes')
PY
echo 'Posting test file to private Supabase Storage...'
curl --fail-with-body --silent --show-error --max-time 180 \
  --cookie "$OMS_COOKIE_JAR" -H 'Accept: application/json' \
  --form "file=@${OMS_TEST_FILE}" "$base" -o "$work/upload.json"
asset_id="$(python3 - "$work/upload.json" "$OMS_BOARD_ID" <<'PY'
import json,re,sys
x=json.load(open(sys.argv[1]))
id=x.get('id','')
assert re.fullmatch(r'[0-9a-fA-F-]{36}',id), 'Bad upload response ID'
assert x.get('url')==f'/api/toolkit/assets/{sys.argv[2]}/{id}', 'Unexpected asset URL'
assert isinstance(x.get('bytes'),int) and x['bytes']>0, 'Missing file size'
print(id)
PY
)"
echo "Uploaded file UUID: $asset_id"
echo 'Verifying the authenticated file route returns byte-identical content...'
curl --fail-with-body --silent --show-error --max-time 120 \
  --cookie "$OMS_COOKIE_JAR" "$base/$asset_id" -o "$work/download.bin"
local_sha="$(sha256sum "$OMS_TEST_FILE" | cut -d' ' -f1)"
saved_sha="$(sha256sum "$work/download.bin" | cut -d' ' -f1)"
[[ "$local_sha" == "$saved_sha" ]] || { echo 'FAIL: downloaded file does not match upload' >&2; exit 1; }
echo 'Verifying the recovery library lists the asset...'
curl --fail-with-body --silent --show-error --max-time 30 \
  --cookie "$OMS_COOKIE_JAR" "$base/library" -o "$work/library.json"
python3 - "$work/library.json" "$asset_id" <<'PY'
import json,sys
rows=json.load(open(sys.argv[1])).get('files',[])
assert any(row.get('id')==sys.argv[2] for row in rows), 'File not in library'
print('Private asset library: file found')
PY
echo 'Verifying unauthenticated download is blocked...'
anonymous_code="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --max-time 15 "$base/$asset_id")"
if [[ "$anonymous_code" != 401 && "$anonymous_code" != 403 ]]; then
  echo "FAIL: anonymous GET returned HTTP $anonymous_code" >&2
  exit 1
fi
echo "PASS: upload, binary round-trip, recovery list and anonymous access (HTTP $anonymous_code)"
echo 'The test object remains in the disposable project. Open Canvas -> Saved files'
echo 'and attach it, save the board, reload, and inspect preview before deleting that project.'
