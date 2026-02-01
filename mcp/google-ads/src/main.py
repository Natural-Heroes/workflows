"""HTTP wrapper for Google Ads MCP server.

Wraps google-marketing-solutions/google_ads_mcp with Streamable HTTP transport.
"""
import os
import sys

# Set port before importing the server
os.environ.setdefault("PORT", "3001")

# Import server
from ads_mcp.coordinator import mcp_server

# Try to import tools with error handling
try:
    from ads_mcp.tools import api  # noqa: F401 - import registers tools
    print("Successfully imported ads_mcp.tools.api")
except Exception as e:
    print(f"Error importing ads_mcp.tools.api: {e}", file=sys.stderr)

try:
    from ads_mcp.tools import docs  # noqa: F401 - import registers tools
    print("Successfully imported ads_mcp.tools.docs")
except Exception as e:
    print(f"Error importing ads_mcp.tools.docs: {e}", file=sys.stderr)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3001"))
    mcp_server.settings.host = "0.0.0.0"
    mcp_server.settings.port = port
    print(f"Starting Google Ads MCP server on port {port}...")
    mcp_server.run(transport="streamable-http", show_banner=False)
