#!/bin/bash
# Bump the asset version after any code (not data) change. Updates the ?v= tags in index.html,
# the inline BUILD constant and version.txt -- open pages see the new version.txt and refresh themselves.
cd "$(dirname "$0")"
V=$(date +%Y%m%d%H%M)
sed -i '' -E "s/\?v=[0-9]+/?v=$V/g; s/var BUILD=\"[0-9]+\"/var BUILD=\"$V\"/" index.html
printf '%s\n' "$V" > version.txt
echo "version $V ($(grep -c "?v=$V" index.html) asset tags)"
