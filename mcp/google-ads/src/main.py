"""HTTP wrapper for Google Ads MCP server.

Wraps google-marketing-solutions/google_ads_mcp with Streamable HTTP transport.
"""
import os

# Set port before importing the server
os.environ.setdefault("PORT", "3001")

# Patch FastMCP to disable DNS rebinding protection BEFORE importing ads_mcp
# Note: google_ads_mcp uses fastmcp package, not mcp.server.fastmcp
from fastmcp import FastMCP
from fastmcp.server.settings import TransportSecurity

_original_init = FastMCP.__init__

def _patched_init(self, name="FastMCP", **kwargs):
    if "transport_security" not in kwargs:
        kwargs["transport_security"] = TransportSecurity(
            enable_dns_rebinding_protection=False,
        )
    _original_init(self, name, **kwargs)

FastMCP.__init__ = _patched_init

# Import server and tools (importing tools registers them via decorators)
from ads_mcp.coordinator import mcp_server
from ads_mcp.tools import api  # noqa: F401 - import registers tools
from ads_mcp.tools import docs  # noqa: F401 - import registers tools

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3001"))
    mcp_server.settings.host = "0.0.0.0"
    mcp_server.settings.port = port
    print(f"Starting Google Ads MCP server on port {port}...")
    mcp_server.run(transport="streamable-http", show_banner=False)
