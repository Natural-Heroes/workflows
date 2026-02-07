import { loadConfig } from "../src/config/loader.js";
import { startOAuthFlow } from "../src/oauth/flow.js";
import { TokenManager } from "../src/oauth/token-manager.js";

async function main() {
  console.log("Loading config...");
  const config = await loadConfig();

  console.log("Starting OAuth flow...");
  const tokens = await startOAuthFlow(config.linear);

  const tokenManager = new TokenManager(config.linear);
  await tokenManager.saveTokens(tokens);

  console.log("Tokens saved successfully.");
}

main().catch((err) => {
  console.error("OAuth setup failed:", err);
  process.exit(1);
});
