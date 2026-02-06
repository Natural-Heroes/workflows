"""HTTP wrapper for Google Ads MCP server.

Wraps google-marketing-solutions/google_ads_mcp with Streamable HTTP transport.
Patches mask_error_details to surface real error messages for debugging.
"""
import asyncio
import os
import sys
import traceback

# Set port before importing the server
os.environ.setdefault("PORT", "3001")

# Import server
from ads_mcp.coordinator import mcp_server

# --- CRITICAL FIX: Disable error masking ---
# The upstream coordinator sets mask_error_details=True which replaces all
# error messages with generic "Internal error" text. This makes debugging
# impossible since GoogleAdsException details, credential errors, and
# ToolError messages are all swallowed.
try:
    mcp_server.settings.mask_error_details = False
    print("[startup] Disabled mask_error_details on mcp_server.settings")
except AttributeError:
    # FastMCP might store it differently depending on version
    try:
        mcp_server._mask_error_details = False
        print("[startup] Disabled _mask_error_details on mcp_server")
    except AttributeError:
        print(
            "[startup] WARNING: Could not disable mask_error_details. "
            "Errors may still be hidden.",
            file=sys.stderr,
        )

# --- Import tool modules to register MCP tools ---
try:
    from ads_mcp.tools import api  # noqa: F401

    print("[startup] Imported ads_mcp.tools.api (tools registered)")
except Exception as e:
    print(f"[startup] ERROR importing ads_mcp.tools.api: {e}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)

try:
    from ads_mcp.tools import docs  # noqa: F401

    print("[startup] Imported ads_mcp.tools.docs (tools registered)")
except Exception as e:
    print(
        f"[startup] ERROR importing ads_mcp.tools.docs: {e}", file=sys.stderr
    )
    traceback.print_exc(file=sys.stderr)

# --- Generate view/field YAML docs if missing ---
# The upstream server.py calls update_views_yaml() at startup to generate
# context/views/*.yaml and context/fields.yaml. Without these files:
#   - get_reporting_view_doc(view="campaign") fails (missing YAML)
#   - get_reporting_fields_doc(fields=["campaign.id"]) fails (missing fields.yaml)
try:
    from ads_mcp.scripts.generate_views import update_views_yaml

    print("[startup] Checking/generating view documentation YAML files...")
    asyncio.run(update_views_yaml())
    print("[startup] View documentation YAML files are up to date")
except Exception as e:
    print(
        f"[startup] WARNING: Could not generate view docs: {e}",
        file=sys.stderr,
    )
    traceback.print_exc(file=sys.stderr)
    print(
        "[startup] get_reporting_view_doc(view=...) and "
        "get_reporting_fields_doc() may fail",
        file=sys.stderr,
    )

# --- Validate credentials at startup (non-blocking) ---
try:
    credentials_path = os.environ.get("GOOGLE_ADS_CREDENTIALS", "not set")
    print(f"[startup] GOOGLE_ADS_CREDENTIALS = {credentials_path}")

    if credentials_path != "not set" and os.path.isfile(credentials_path):
        print(f"[startup] Credentials file exists at {credentials_path}")
        # Peek at the yaml to check for required keys (without exposing values)
        import yaml

        with open(credentials_path, "r") as f:
            config = yaml.safe_load(f)
        if config:
            keys_present = list(config.keys())
            print(f"[startup] Credentials YAML keys: {keys_present}")
            if "developer_token" not in config:
                print(
                    "[startup] WARNING: 'developer_token' missing from "
                    "credentials YAML",
                    file=sys.stderr,
                )
        else:
            print(
                "[startup] WARNING: Credentials YAML is empty",
                file=sys.stderr,
            )
    elif credentials_path != "not set":
        print(
            f"[startup] WARNING: Credentials file NOT found at "
            f"{credentials_path}",
            file=sys.stderr,
        )
    else:
        # Check the default path used by get_ads_client()
        from ads_mcp.utils import ROOT_DIR

        default_path = f"{ROOT_DIR}/google-ads.yaml"
        exists = os.path.isfile(default_path)
        print(
            f"[startup] No GOOGLE_ADS_CREDENTIALS env var. "
            f"Default path {default_path} exists: {exists}"
        )
except Exception as e:
    print(f"[startup] Error during credential check: {e}", file=sys.stderr)

# --- Register debug_auth tool ---


@mcp_server.tool()
def debug_auth() -> dict:
    """Diagnose Google Ads API authentication issues.

    Tests the full credential chain and returns detailed status:
    - Whether the credentials file exists and has required keys
    - Whether the Google Ads client can be constructed
    - Whether ListAccessibleCustomers succeeds (proves auth works)
    - Raw error details if anything fails

    Use this tool first when other Google Ads tools return errors.
    """
    result = {
        "credentials_file": {},
        "client_construction": {},
        "list_accessible_customers": {},
        "env_vars": {},
    }

    # Check environment variables (redacted)
    credentials_path = os.environ.get("GOOGLE_ADS_CREDENTIALS")
    result["env_vars"] = {
        "GOOGLE_ADS_CREDENTIALS": credentials_path or "NOT SET",
        "USE_GOOGLE_OAUTH_ACCESS_TOKEN": os.environ.get(
            "USE_GOOGLE_OAUTH_ACCESS_TOKEN", "NOT SET"
        ),
        "PORT": os.environ.get("PORT", "NOT SET"),
    }

    # Check credentials file
    if credentials_path:
        if os.path.isfile(credentials_path):
            result["credentials_file"]["status"] = "EXISTS"
            try:
                import yaml

                with open(credentials_path, "r") as f:
                    config = yaml.safe_load(f)
                if config:
                    result["credentials_file"]["keys_present"] = list(
                        config.keys()
                    )
                    result["credentials_file"]["developer_token_set"] = bool(
                        config.get("developer_token")
                    )
                    result["credentials_file"]["client_id_set"] = bool(
                        config.get("client_id")
                    )
                    result["credentials_file"]["client_secret_set"] = bool(
                        config.get("client_secret")
                    )
                    result["credentials_file"]["refresh_token_set"] = bool(
                        config.get("refresh_token")
                    )
                    result["credentials_file"]["login_customer_id"] = config.get(
                        "login_customer_id", "NOT SET"
                    )
                else:
                    result["credentials_file"]["status"] = "EMPTY"
            except Exception as e:
                result["credentials_file"]["parse_error"] = str(e)
        else:
            result["credentials_file"]["status"] = "NOT FOUND"
            result["credentials_file"]["path"] = credentials_path
    else:
        from ads_mcp.utils import ROOT_DIR

        default_path = f"{ROOT_DIR}/google-ads.yaml"
        result["credentials_file"]["env_var"] = "NOT SET"
        result["credentials_file"]["default_path"] = default_path
        result["credentials_file"]["default_exists"] = os.path.isfile(
            default_path
        )

    # Try constructing the Google Ads client
    try:
        client = api.get_ads_client()
        result["client_construction"]["status"] = "OK"
        result["client_construction"]["developer_token_set"] = bool(
            getattr(client, "developer_token", None)
        )
        result["client_construction"]["login_customer_id"] = getattr(
            client, "login_customer_id", "NOT SET"
        )
    except Exception as e:
        result["client_construction"]["status"] = "FAILED"
        result["client_construction"]["error"] = str(e)
        result["client_construction"]["error_type"] = type(e).__name__
        result["client_construction"]["traceback"] = traceback.format_exc()
        return result  # Can't proceed without a client

    # Try listing accessible customers
    try:
        from google.ads.googleads.errors import GoogleAdsException

        customer_service = client.get_service("CustomerService")
        accounts = customer_service.list_accessible_customers()
        customer_ids = [
            name.split("/")[-1] for name in accounts.resource_names
        ]
        result["list_accessible_customers"]["status"] = "OK"
        result["list_accessible_customers"]["customer_ids"] = customer_ids
    except GoogleAdsException as e:
        result["list_accessible_customers"]["status"] = "FAILED"
        result["list_accessible_customers"]["error_code"] = str(
            e.failure.errors[0].error_code if e.failure.errors else "unknown"
        )
        result["list_accessible_customers"]["error_message"] = str(
            e.failure.errors[0].message if e.failure.errors else str(e)
        )
        result["list_accessible_customers"]["request_id"] = getattr(
            e, "request_id", "unknown"
        )
    except Exception as e:
        result["list_accessible_customers"]["status"] = "FAILED"
        result["list_accessible_customers"]["error"] = str(e)
        result["list_accessible_customers"]["error_type"] = type(e).__name__
        result["list_accessible_customers"]["traceback"] = (
            traceback.format_exc()
        )

    return result


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "3001"))
    mcp_server.settings.host = "0.0.0.0"
    mcp_server.settings.port = port

    # List registered tools for verification
    try:
        tool_names = list(mcp_server._tool_manager._tools.keys())
        print(f"[startup] Registered tools: {tool_names}")
    except Exception:
        print("[startup] Could not list registered tools")

    print(f"[startup] Starting Google Ads MCP server on port {port}...")
    mcp_server.run(transport="streamable-http", show_banner=False)
