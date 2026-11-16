# Authentication Rules

**Applies to:** `src/app/auth/**`, `src/lib/providers/dataverse/msal-*`

## Azure AD Configuration

### App Registration

- **Client ID:** `e270b52c-c487-4926-8a15-ee4ae1ec1d9f` - and the value actually used is
  `NEXT_PUBLIC_AZURE_CLIENT_ID`, never this line. This file previously carried
  `51f81489-12ee-4a9e-aaae-a2591f45987d`, which is **Microsoft's own well-known public client
  ID**, not this app's; it was checked against `.env.local` on 2026-08-09 and corrected.
- **Tenant:** Single tenant (organization only)
- **Redirect URI:** `https://{domain}/auth/callback` - the **domain comes from
  `NEXT_PUBLIC_APP_URL`**, not `NEXT_PUBLIC_AZURE_REDIRECT_URI`, which MSAL never reads in the
  browser. See CLAUDE.md → Production and [api-routes.md](../docs/api-routes.md).

### Required Scopes

```typescript
const DATAVERSE_SCOPES = {
  default: `${DATAVERSE_URL}/.default`,
  userImpersonation: `${DATAVERSE_URL}/user_impersonation`,
};
```

## MSAL.js Integration

### Initialization

```typescript
import { PublicClientApplication } from '@azure/msal-browser';

const msalConfig = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_AZURE_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_AZURE_TENANT_ID}`,
    redirectUri: process.env.NEXT_PUBLIC_AZURE_REDIRECT_URI,
  },
  cache: {
    // **localStorage in this app**, not sessionStorage - checked in
    // msal-config.ts on 2026-08-28. The difference is load-bearing: the session
    // survives closing the browser, which is why there is an idle timeout
    // (docs/security-and-conventions), and why an idle sign-out has to clear
    // MSAL's cache as well as the cookies or the next page load signs the
    // person straight back in.
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
};

const msalInstance = new PublicClientApplication(msalConfig);
await msalInstance.initialize();
```

### Dynamic Import (Required for Next.js)

MSAL.js uses browser APIs and must be dynamically imported:

```typescript
// Wrong - will break SSR
import { msalInstance } from '@/lib/providers/dataverse/msal-browser';

// Correct - dynamic import
let msalFunctions: any = null;

async function getMsalFunctions() {
  if (!msalFunctions) {
    msalFunctions = await import('@/lib/providers/dataverse/msal-browser');
  }
  return msalFunctions;
}
```

## Token Acquisition

### Silent Token (Preferred)

```typescript
async function getAccessTokenSilent(): Promise<string | null> {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length === 0) return null;

  try {
    const result = await msalInstance.acquireTokenSilent({
      scopes: [DATAVERSE_SCOPES.default],
      account: accounts[0],
    });
    return result.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      // Fallback to interactive
      return getAccessTokenInteractive();
    }
    throw error;
  }
}
```

### Interactive Token (Fallback)

```typescript
async function getAccessTokenInteractive(): Promise<string> {
  const result = await msalInstance.acquireTokenRedirect({
    scopes: [DATAVERSE_SCOPES.default],
  });
  // User will be redirected, handle in callback
}
```

## Auth Callback Handler

```typescript
// src/app/auth/callback/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    async function handleCallback() {
      const msal = await import('@/lib/providers/dataverse/msal-browser');
      await msal.handleRedirectPromise();

      const token = await msal.getAccessToken();
      if (token) {
        // Store in HTTP-only cookie via API
        await fetch('/api/auth/dataverse/token', {
          method: 'POST',
          body: JSON.stringify({ accessToken: token }),
        });
        router.push('/dashboard');
      } else {
        router.push('/login?error=auth_failed');
      }
    }

    handleCallback();
  }, [router]);

  return <div>Completing sign in...</div>;
}
```

## Token Storage

Store tokens in HTTP-only cookies (not localStorage):

```typescript
// src/app/api/auth/dataverse/token/route.ts
import { cookies } from 'next/headers';

export async function POST(request: Request) {
  const { accessToken, expiresAt } = await request.json();

  cookies().set('dataverse_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 3600, // 1 hour
  });

  return Response.json({ success: true });
}

export async function DELETE() {
  cookies().delete('dataverse_token');
  return Response.json({ success: true });
}
```

## UPN vs Email

Azure AD returns both UPN (User Principal Name) and email:

```typescript
// UPN: ishigeh@hoya.com (login identifier)
// Email: hiroyuki.ishige@hoya.com (actual email)

function getUserEmail(claims: any): string {
  return claims.email ||
         claims.preferred_username ||
         claims.upn;
}
```

## Vercel Preview Deployment

Preview URLs are not registered in Azure AD. Handle by redirecting to production for auth:

```typescript
function getRedirectUri(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const productionDomain = process.env.NEXT_PUBLIC_APP_URL;

  // Preview deployments redirect to production
  if (origin !== productionDomain && productionDomain) {
    return `${productionDomain}/auth/callback`;
  }

  return `${origin}/auth/callback`;
}
```

## AuthProvider Context

```typescript
// src/components/providers/AuthProvider.tsx
'use client';

import { createContext, useContext, useState, useEffect } from 'react';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      signIn,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```
