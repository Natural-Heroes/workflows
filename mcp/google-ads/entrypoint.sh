#!/bin/bash
# Write google-ads.yaml credentials if provided as env var
# Supports both plain YAML and base64-encoded YAML (GOOGLE_ADS_YAML_BASE64)
if [ -n "$GOOGLE_ADS_YAML_BASE64" ]; then
    echo "$GOOGLE_ADS_YAML_BASE64" | base64 -d > /app/google-ads.yaml
    export GOOGLE_ADS_CREDENTIALS=/app/google-ads.yaml
elif [ -n "$GOOGLE_ADS_YAML" ]; then
    echo "$GOOGLE_ADS_YAML" > /app/google-ads.yaml
    export GOOGLE_ADS_CREDENTIALS=/app/google-ads.yaml
fi

exec "$@"
