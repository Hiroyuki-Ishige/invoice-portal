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
    .spinner { display: block; width: 80px; height: auto; margin: 0 auto 16px; color: #0057BC; }
    .d { animation: 2.5s ease-in-out infinite; }
    .h0 { animation-name: h0; } .h1 { animation-name: h1; } .h2 { animation-name: h2; } .h3 { animation-name: h3; } .h4 { animation-name: h4; } .h5 { animation-name: h5; } .h6 { animation-name: h6; }
    @keyframes h0 { 0%, 62% { transform: translate(0, 0); } 74%, 100% { transform: translate(var(--dx), var(--dy)); } }
    @keyframes h1 { 0%, 52% { transform: translate(0, 0); } 64%, 100% { transform: translate(var(--dx), var(--dy)); } }
    @keyframes h2 { 0%, 42% { transform: translate(0, 0); } 54%, 100% { transform: translate(var(--dx), var(--dy)); } }
    @keyframes h3 { 0%, 32% { transform: translate(0, 0); } 44%, 100% { transform: translate(var(--dx), var(--dy)); } }
    @keyframes h4 { 0%, 22% { transform: translate(0, 0); } 34%, 100% { transform: translate(var(--dx), var(--dy)); } }
    @keyframes h5 { 0%, 12% { transform: translate(0, 0); } 24%, 100% { transform: translate(var(--dx), var(--dy)); } }
    @keyframes h6 { 0%, 2% { transform: translate(0, 0); } 14%, 100% { transform: translate(var(--dx), var(--dy)); } }
    @media (prefers-reduced-motion: reduce) { .d { animation: none; } }
  </style>
</head>
<body>
  <div class="loader">
    <svg class="spinner" viewBox="-95 -65 190 135" aria-hidden="true">
      <g class="d h0" style="--dx:70px;--dy:0px"><g transform="translate(-35 -38) rotate(45)"><rect x="-16" y="-16" width="32" height="32" rx="7" fill="currentColor"/></g></g>
      <g class="d h1" style="--dx:34px;--dy:36px"><g transform="translate(35 -38) rotate(45)"><rect x="-16" y="-16" width="32" height="32" rx="7" fill="currentColor"/></g></g>
      <g class="d h2" style="--dx:-41px;--dy:41px"><g transform="translate(69 -2) rotate(45)"><rect x="-16" y="-16" width="32" height="32" rx="7" fill="currentColor"/></g></g>
      <g class="d h3" style="--dx:-55px;--dy:2px"><g transform="translate(28 39) rotate(45)"><rect x="-16" y="-16" width="32" height="32" rx="7" fill="currentColor"/></g></g>
      <g class="d h4" style="--dx:-42px;--dy:-42px"><g transform="translate(-27 41) rotate(45)"><rect x="-16" y="-16" width="32" height="32" rx="7" fill="currentColor"/></g></g>
      <g class="d h5" style="--dx:69px;--dy:-2px"><g transform="translate(-69 -1) rotate(45)"><rect x="-16" y="-16" width="32" height="32" rx="7" fill="currentColor"/></g></g>
      <g class="d h6" style="--dx:-35px;--dy:-35px"><g transform="translate(0 -3) rotate(45)"><rect x="-16" y="-16" width="32" height="32" rx="7" fill="currentColor"/></g></g>
    </svg>
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
