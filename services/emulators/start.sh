#!/bin/sh
set -eu
if [ -f /data/firebase-export-metadata.json ]; then
 set -- --import=/data
else
 set --
fi
exec firebase emulators:start --project demo-pocket --only auth,firestore --export-on-exit=/data "$@"
