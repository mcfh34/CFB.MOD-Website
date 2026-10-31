#!/usr/bin/env bash
set -euo pipefail

status="$(sites-preview status)"
grep -q "Sites preview running" <<<"${status}"
echo "${status}"
