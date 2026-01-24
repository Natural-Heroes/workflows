/**
 * Server-rendered HTML login page for OAuth authorization flow.
 *
 * Renders a clean, mobile-responsive login form where users enter their
 * Odoo email and API key. The form POSTs to /login with the pending
 * authorization ID to complete the OAuth flow.
 */

/**
 * Renders the login page HTML.
 *
 * @param pendingId - The pending authorization ID (hidden form field)
 * @param error - Optional error message to display
 * @returns Complete HTML page string
 */
export function renderLoginPage(pendingId: string, error?: string, basePath = ''): string {
  const errorHtml = error
    ? '<div class="error">' + escapeHtml(error) + '</div>'
    : '';

  const parts = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>Odoo MCP - Sign In</title>',
    '<style>',
    getStyles(),
    '</style>',
    '</head>',
    '<body>',
    '<div class="container">',
    '<div class="card">',
    '<h1>Odoo MCP - Sign In</h1>',
    '<p class="subtitle">Enter your Odoo credentials to connect</p>',
    errorHtml,
    '<form action="' + escapeHtml(basePath) + '/login" method="POST">',
    '<input type="hidden" name="pending" value="' + escapeHtml(pendingId) + '">',
    '<div class="field">',
    '<label for="email">Odoo Login Email</label>',
    '<input type="email" id="email" name="email" placeholder="user@example.com" required autocomplete="email">',
    '</div>',
    '<div class="field">',
    '<label for="api_key">Odoo API Key</label>',
    '<input type="password" id="api_key" name="api_key" placeholder="Your Odoo API key" required>',
    '<p class="help">Generate an API key in Odoo: Settings &gt; Security &gt; API Keys</p>',
    '</div>',
    '<button type="submit">Sign In</button>',
    '</form>',
    '</div>',
    '</div>',
    '</body>',
    '</html>',
  ];

  return parts.join('\n');
}

/**
 * Escapes HTML special characters to prevent XSS.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Returns the CSS styles for the login page.
 */
function getStyles(): string {
  return [
    '* { margin: 0; padding: 0; box-sizing: border-box; }',
    'body {',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '  background: #f5f5f5;',
    '  color: #333;',
    '  min-height: 100vh;',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  padding: 1rem;',
    '}',
    '.container { width: 100%; max-width: 400px; }',
    '.card {',
    '  background: #fff;',
    '  border-radius: 8px;',
    '  box-shadow: 0 2px 8px rgba(0,0,0,0.1);',
    '  padding: 2rem;',
    '}',
    'h1 {',
    '  font-size: 1.5rem;',
    '  margin-bottom: 0.25rem;',
    '  color: #1a1a1a;',
    '}',
    '.subtitle {',
    '  color: #666;',
    '  margin-bottom: 1.5rem;',
    '  font-size: 0.9rem;',
    '}',
    '.error {',
    '  background: #fef2f2;',
    '  border: 1px solid #fecaca;',
    '  color: #dc2626;',
    '  padding: 0.75rem 1rem;',
    '  border-radius: 6px;',
    '  margin-bottom: 1rem;',
    '  font-size: 0.875rem;',
    '}',
    '.field { margin-bottom: 1rem; }',
    '.field label {',
    '  display: block;',
    '  font-weight: 500;',
    '  margin-bottom: 0.25rem;',
    '  font-size: 0.875rem;',
    '}',
    '.field input {',
    '  width: 100%;',
    '  padding: 0.5rem 0.75rem;',
    '  border: 1px solid #d1d5db;',
    '  border-radius: 6px;',
    '  font-size: 1rem;',
    '  transition: border-color 0.15s;',
    '}',
    '.field input:focus {',
    '  outline: none;',
    '  border-color: #6366f1;',
    '  box-shadow: 0 0 0 3px rgba(99,102,241,0.1);',
    '}',
    '.help {',
    '  color: #666;',
    '  font-size: 0.75rem;',
    '  margin-top: 0.25rem;',
    '}',
    'button {',
    '  width: 100%;',
    '  padding: 0.625rem 1rem;',
    '  background: #6366f1;',
    '  color: #fff;',
    '  border: none;',
    '  border-radius: 6px;',
    '  font-size: 1rem;',
    '  font-weight: 500;',
    '  cursor: pointer;',
    '  transition: background 0.15s;',
    '  margin-top: 0.5rem;',
    '}',
    'button:hover { background: #4f46e5; }',
    'button:active { background: #4338ca; }',
  ].join('\n');
}
