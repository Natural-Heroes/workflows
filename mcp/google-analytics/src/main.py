"""HTTP wrapper for Google Analytics MCP server.

Wraps Google's official analytics-mcp package with Streamable HTTP transport
to enable remote access from Claude.ai and other MCP clients.
"""

import os

from analytics_mcp.coordinator import mcp
from mcp.server.transport_security import TransportSecuritySettings

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3001"))
    allowed_host = os.environ.get("ALLOWED_HOST", "mcp-ga.naturalheroes.nl")

    # Configure transport security to allow the custom domain
    mcp._transport_security = TransportSecuritySettings(
        enable_dns_rebinding_protection=True,
        allowed_hosts=[
            "localhost:*",
            "127.0.0.1:*",
            f"{allowed_host}:*",
            allowed_host,
        ],
        allowed_origins=[
            "http://localhost:*",
            "https://localhost:*",
            f"https://{allowed_host}",
            f"https://{allowed_host}:*",
        ],
    )

    # Set MCP settings for HTTP transport
    mcp.settings.host = "0.0.0.0"
    mcp.settings.port = port

    mcp.run(transport="streamable-http")
