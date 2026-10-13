#!/usr/bin/env bash
# Authenticated order-file round trip. Does not mutate the order lifecycle.
# Use a disposable draft with a real user session, not customer production data.
set -euo pipefail
: "${OMS_BASE_URL:?OMS_BASE_URL must be set}"
: "${OMS_ORDER_ID:?OMS_ORDER_ID must be set}"
: "${OMS_COOKIE_JAR:?OMS_COOKIE_JAR must point to private Netscape-format cookies}"
: "${OMS_TEST_FILE:?OMS_TEST_FILE must point to a small PNG/JPEG/PDF/DXF/CDR test file}"
for tool in curl python3 sha256sum; do command -v "$tool" >/dev/null || exit 2; done
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
base="${OMS_BASE_URL%/}"
echo 'Uploading file to order...'
curl --fail-with-body --show-error --silent --max-time 180 \
  --cookie "$OMS_COOKIE_JAR" --form "file=@${OMS_TEST_FILE}" \
  --form "order_id=${OMS_ORDER_ID}" --form 'file_type=attachment' \
  "$base/api/files" -o "$tmp/file.json"
file_id="$(python3 - "$tmp/file.json" <<'PY'
import json,re,sys
r=json.load(open(sys.argv[1]))
assert re.fullmatch(r'[a-fA-F0-9-]{36}',r.get('id','')),r
print(r['id'])
PY
)"
echo "File id: $file_id"
curl --fail-with-body --show-error --silent --max-time 30 \
  --cookie "$OMS_COOKIE_JAR" \
  "$base/api/files?orderId=${OMS_ORDER_ID}" -o "$tmp/list.json"
python3 - "$tmp/list.json" "$file_id" <<'PY'
import json,sys
assert any(r['id']==sys.argv[2] for r in json.load(open(sys.argv[1])))
print('Order attachment link exists')
PY
curl --fail-with-body --show-error --silent --max-time 120 \
  --cookie "$OMS_COOKIE_JAR" \
  "$base/api/files/$file_id?download=true" -o "$tmp/roundtrip.bin"
if [[ "$(sha256sum "$OMS_TEST_FILE" | cut -d' ' -f1)" != \
      "$(sha256sum "$tmp/roundtrip.bin" | cut -d' ' -f1)" ]]; then
  echo 'FAIL: attachment payload mismatch' >&2; exit 1
fi
anonymous="$(curl --silent --show-error --max-time 20 -o /dev/null \
  -w '%{http_code}' "$base/api/files/$file_id?download=true")"
if [[ "$anonymous" != 401 && "$anonymous" != 403 ]]; then
  echo "FAIL: unauthenticated attachment response HTTP $anonymous" >&2; exit 1
fi
echo "PASS: order-linked upload/list/download/hash/authentication; retained file $file_id"
echo 'After confirming the draft via the Boss/HoP UI, rerun the GET/list/download'
echo 'against the SAME OMS_ORDER_ID to verify production attachment persistence.'
