/**
 * Run this once to authenticate with Google:
 *   npm run auth
 *
 * It will open your browser, ask you to log in,
 * then save your tokens to the local SQLite database.
 */

import 'dotenv/config';
import http from 'http';
import { createOAuthClient, getAuthUrl } from '../gmail/client.js';
import { upsertUser } from '../db/index.js';
import { google } from 'googleapis';

const PORT = 3333;
const client = createOAuthClient();
const authUrl = getAuthUrl(client);

console.log('\n🔫 Mafia — Gmail Auth Setup\n');
console.log('Opening browser for Google OAuth...');
console.log('If it does not open, visit:\n');
console.log(authUrl, '\n');

// Try to open browser
try {
  const { default: open } = await import('open');
  await open(authUrl);
} catch {
  // Browser open failed, user will copy URL manually
}

// Start local server to catch the OAuth callback
const server = http.createServer(async (req, res) => {
  if (!req.url?.startsWith('/oauth/callback')) {
    res.end('Not found');
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const code = url.searchParams.get('code');

  if (!code) {
    res.end('Error: no code in callback');
    return;
  }

  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Get user profile
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const profile = await oauth2.userinfo.get();

    const user = upsertUser({
      id: profile.data.email!,
      email: profile.data.email!,
      name: profile.data.name ?? null,
      access_token: tokens.access_token ?? null,
      refresh_token: tokens.refresh_token ?? null,
      token_expiry: tokens.expiry_date ?? null,
    });

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h1>🔫 Mafia</h1>
        <h2>✅ Authenticated as ${user.email}</h2>
        <p>You can close this tab and return to your terminal.</p>
      </body></html>
    `);

    console.log(`\n✅ Authenticated as: ${user.email}`);
    console.log('Tokens saved to local database.');
    console.log('\nNext steps:');
    console.log('1. Add the MCP server to your Claude Desktop config (see README.md)');
    console.log('2. Restart Claude Desktop');
    console.log('3. Ask Claude: "fetch 5 emails for triage"\n');

    server.close();
    process.exit(0);
  } catch (err) {
    res.end(`Error: ${err}`);
    console.error('Auth error:', err);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`\nWaiting for OAuth callback on http://localhost:${PORT}...`);
});
