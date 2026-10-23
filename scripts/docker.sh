#!/usr/bin/env bash
set -euo pipefail

image=${1:?usage: docker.sh <image>}
name=dbs-sh
url=http://127.0.0.1:3333

cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
fail() { echo "FAIL: $*" >&2; docker logs "$name" >&2 || true; exit 1; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

docker run -d --name "$name" --health-interval=2s -p 127.0.0.1:3333:3333 "$image" >/dev/null

status=starting
for _ in $(seq 60); do
	status=$(docker inspect -f '{{.State.Health.Status}}' "$name")
	[ "$status" = healthy ] && break
	sleep 1
done
[ "$status" = healthy ] || fail "health status is $status"

[ "$(code "$url/")" = 200 ] || fail "normal host should get 200"
[ "$(code -H 'Host: evil.example' "$url/")" = 403 ] || fail "foreign host should get 403"
[ "$(docker exec "$name" id -u)" = 1000 ] || fail "container should run as uid 1000"

for m in @duckdb/node-api oracledb @libsql/client; do
	docker exec "$name" node -e "import('$m').catch(e=>{console.error(e.message);process.exit(1)})" \
		|| fail "$m does not load"
done

echo "ok"
