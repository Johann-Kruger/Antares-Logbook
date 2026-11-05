#!/bin/bash
# Runs every browser test against www/index.html and fails if any check fails.
# Setup once:  python3 -m pip install -r tests/requirements.txt && python3 -m playwright install chromium
set -u
cd "$(dirname "$0")"
PY="${PYTHON:-python3}"
failed=()
for t in test_*.py; do
  out=$("$PY" "$t" 2>&1)
  status=$?
  printf '%s\n' "$out" | grep -E 'FAIL|passed|Error|Traceback' || printf '%s: no result line\n' "$t"
  [ "$status" -eq 0 ] || failed+=("$t")
done
echo ""
if [ ${#failed[@]} -gt 0 ]; then
  echo "FAILED: ${failed[*]}"
  exit 1
fi
echo "All test files passed."
