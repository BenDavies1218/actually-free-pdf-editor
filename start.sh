#!/bin/sh
PORT=${1:-8000}
echo "Starting server on http://localhost:$PORT"
if command -v python3 >/dev/null 2>&1; then
  python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  python -m SimpleHTTPServer "$PORT"
elif command -v npx >/dev/null 2>&1; then
  npx http-server -p "$PORT" -o
else
  echo "Error: python3, python, or npx required" >&2
  exit 1
fi
