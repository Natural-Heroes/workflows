"""HTTP wrapper for Google Analytics MCP server.

Wraps Google's official analytics-mcp package with Streamable HTTP transport
to enable remote access from Claude.ai and other MCP clients.
"""

import os

from analytics_mcp.coordinator import mcp

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3001"))

    mcp.run(
        transport="streamable-http",
        host="0.0.0.0",
        port=port,
    )
