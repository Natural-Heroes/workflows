"""HTTP wrapper for Google Ads MCP server.

Wraps google-marketing-solutions/google_ads_mcp with Streamable HTTP transport
to enable remote access from Claude.ai and other MCP clients.

We need to patch FastMCP before ads_mcp imports it to set transport_security.
"""

import os

# Patch FastMCP to disable DNS rebinding protection BEFORE ads_mcp imports it
from mcp.server.fastmcp import FastMCP
from mcp.server.transport_security import TransportSecuritySettings

_original_init = FastMCP.__init__


def _patched_init(self, name="FastMCP", **kwargs):
    # Inject our transport_security settings if not already provided
    if "transport_security" not in kwargs:
        kwargs["transport_security"] = TransportSecuritySettings(
            enable_dns_rebinding_protection=False,
        )
    _original_init(self, name, **kwargs)


FastMCP.__init__ = _patched_init

# Now import ads_mcp which will create its FastMCP with our patched __init__
from ads_mcp.server import mcp  # noqa: E402

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3001"))

    # Set MCP settings for HTTP transport
    mcp.settings.host = "0.0.0.0"
    mcp.settings.port = port

    mcp.run(transport="streamable-http")
