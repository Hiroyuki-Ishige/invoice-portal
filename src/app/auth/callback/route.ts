/**
 * Auth Callback Route
 *
 * Handles Azure AD redirect response.
 * For MSAL, the auth code is in the URL hash which isn't sent to the server,
 * so we return an HTML page that redirects to the home page with hash preserved.
 */

import { NextResponse } from "next/server";

export async function GET() {
  // Return HTML page that preserves the hash for MSAL processing
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authenticating...</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .loader { text-align: center; }
    .spinner { width: 40px; height: 40px; border: 3px solid rgba(0, 87, 188, 0.2); border-top-color: #0057BC; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="loader">
    <div class="spinner"></div>
    <p>Authenticating...</p>
  </div>
  <script>
    // Redirect to the main app with the hash preserved
    const hash = window.location.hash;
    window.location.replace('/' + hash);
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html" },
  });
}
