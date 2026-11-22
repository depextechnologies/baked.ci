#!/usr/bin/env bash
# Usage: source /app/memory/cust_token.sh [phone]  -> exports CT (customer bearer token)
L=${API:-http://localhost:8001/api}
P=${1:-0700000000}
R=$(curl -s -X POST $L/auth/otp/request -H 'Content-Type: application/json' -d "{\"country_code\":\"CI\",\"phone\":\"$P\"}")
CH=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin)['challenge_id'])")
CODE=$(echo "$R" | python3 -c "import sys,json;print(json.load(sys.stdin)['dev_code'])")
V=$(curl -s -X POST $L/auth/otp/verify -H 'Content-Type: application/json' -d "{\"challenge_id\":\"$CH\",\"code\":\"$CODE\"}")
export CT=$(echo "$V" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('token') or d.get('session_token') or d.get('access_token'))")
