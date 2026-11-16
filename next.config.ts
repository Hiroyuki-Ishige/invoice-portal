import type { NextConfig } from "next";

/**
 * Response headers sent with every page.
 *
 * There were none, and two things in this app make that expensive rather than
 * merely untidy:
 *
 * - **Attachments are served from this origin.** `/api/.../attachments/[id]`
 *   answers with the `mimetype` the uploader's browser declared, and can be
 *   asked to send it `inline`. A file claiming `text/plain` while containing
 *   HTML is script on this origin, with the session cookies. `nosniff` is what
 *   stops the browser second-guessing the declared type - and the route itself
 *   now only ever says `inline` for a PDF or an image.
 * - **Approving is a button.** A ringi's Approve is one click on a page that
 *   would happily load in an invisible iframe on somebody else's site.
 *   `frame-ancestors` (and `X-Frame-Options` for anything that predates it) is
 *   the whole of the defence against that.
 *
 * ### The CSP is Report-Only, deliberately
 *
 * `layout.tsx` applies the dark-mode class before paint with an inline script,
 * and Next.js emits inline bootstrap of its own, so an enforcing
 * `script-src 'self'` would blank the app. Getting to one means nonces
 * threaded through both. Report-Only puts the violations in the console -
 * including the list of what would break - without a white screen in
 * production, and the enforcing header is the follow-up rather than a guess
 * made now. The two headers that need no such care are enforced.
 */
const SECURITY_HEADERS = [
  // The one that matters most here: it is what makes an uploaded "text/plain"
  // stay text rather than become a page.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // DENY, not SAMEORIGIN: nobody frames this app, this app included. The one
  // thing that wanted to - the PDF preview - builds a `blob:` URL instead, so
  // the header never had to be traded down for it.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // A ringi URL in a referrer header tells another site which application
  // somebody is reading. Origin-only, cross-origin.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Content-Security-Policy-Report-Only",
    value: [
      "default-src 'self'",
      // Azure OpenAI, Document Intelligence, Dataverse and Graph are all
      // called from the browser on the user's own token.
      "connect-src 'self' https://*.dynamics.com https://graph.microsoft.com https://login.microsoftonline.com https://*.openai.azure.com https://*.cognitiveservices.azure.com",
      "img-src 'self' data: blob:",
      // Space Grotesk arrives through next/font, which self-hosts it.
      "font-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "frame-ancestors 'none'",
      // The attachment preview frames a PDF from a `blob:` URL it built itself,
      // because `X-Frame-Options: DENY` below forbids framing this origin's own
      // responses - see the note on `previewPdfUrl` in the approval page. Named
      // here so the enforcing CSP this Report-Only one is a rehearsal for does
      // not silently blank that dialog: `frame-src` otherwise falls back to
      // `default-src 'self'`, which does not cover blob.
      "frame-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
