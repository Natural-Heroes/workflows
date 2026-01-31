#!/bin/bash
# Write google-ads.yaml credentials if provided as env var
if [ -n "$GOOGLE_ADS_YAML" ]; then
    echo "$GOOGLE_ADS_YAML" > /app/google-ads.yaml
    export GOOGLE_ADS_CREDENTIALS=/app/google-ads.yaml
fi

exec "$@"
