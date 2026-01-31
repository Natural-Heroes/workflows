#!/bin/bash
# Write credentials JSON to file if provided as env var
if [ -n "$GOOGLE_CREDENTIALS_JSON" ]; then
    echo "$GOOGLE_CREDENTIALS_JSON" > /app/credentials.json
    export GOOGLE_APPLICATION_CREDENTIALS=/app/credentials.json
fi

exec "$@"
