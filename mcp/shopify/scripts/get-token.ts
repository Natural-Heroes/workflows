/**
 * One-time OAuth script to obtain a Shopify offline access token.
 *
 * Usage:
 *   npx tsx scripts/get-token.ts
 *
 * Then open the URL printed in the console, authorize the app,
 * and the token will be printed for you to add to .env.
 */

import http from 'node:http';
import crypto from 'node:crypto';

const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const SHOP = process.env.SHOPIFY_SHOP || 'natural-heroes-nl.myshopify.com';
const PORT = 3456;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

const SCOPES = [
  'read_products',
  'read_orders',
  'read_customers',
  'write_customers',
  'read_inventory',
].join(',');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\nMissing environment variables. Run with:');
  console.error(
    `  SHOPIFY_CLIENT_ID=your_client_id SHOPIFY_CLIENT_SECRET=your_secret npx tsx scripts/get-token.ts\n`,
  );
  process.exit(1);
}

const nonce = crypto.randomBytes(16).toString('hex');

const installUrl =
  `https://${SHOP}/admin/oauth/authorize` +
  `?client_id=${CLIENT_ID}` +
  `&scope=${SCOPES}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&state=${nonce}`;

const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/callback')) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (state !== nonce) {
    res.writeHead(400);
    res.end('State mismatch — possible CSRF attack.');
    server.close();
    return;
  }

  if (!code) {
    res.writeHead(400);
    res.end('No authorization code received.');
    server.close();
    return;
  }

  // Exchange code for access token
  try {
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
    });

    const tokenRes = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      res.writeHead(500);
      res.end(`Token exchange failed: ${errText}`);
      console.error('\nToken exchange failed:', errText);
      server.close();
      return;
    }

    const data = (await tokenRes.json()) as {
      access_token: string;
      scope: string;
    };

    console.log('\n✅ Access token obtained!\n');
    console.log(`  Access Token: ${data.access_token}`);
    console.log(`  Scopes: ${data.scope}\n`);
    console.log('Add this to your .env file:');
    console.log(`  SHOPIFY_STORE_NL_TOKEN=${data.access_token}\n`);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(
      '<h1>Done!</h1><p>Access token printed in your terminal. You can close this tab.</p>',
    );
  } catch (err) {
    res.writeHead(500);
    res.end(`Error: ${err}`);
    console.error('\nError exchanging token:', err);
  }

  server.close();
});

server.listen(PORT, () => {
  console.log(`\nOpen this URL in your browser to install the app:\n`);
  console.log(`  ${installUrl}\n`);
  console.log(`Waiting for OAuth callback on port ${PORT}...\n`);
});
