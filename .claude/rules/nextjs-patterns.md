# Next.js Patterns

**Applies to:** `src/app/**`, `src/components/**`

## App Router Structure

```
src/app/
├── layout.tsx          # Root layout (providers)
├── page.tsx            # Home page
├── auth/
│   └── callback/
│       └── page.tsx    # OAuth callback (Client Component)
├── dashboard/
│   ├── layout.tsx      # Dashboard layout
│   └── page.tsx        # Dashboard page
├── budget/
│   └── page.tsx        # Budget view page
└── api/
    └── dataverse/
        └── budget/
            └── route.ts # API route
```

## Server vs Client Components

### Server Components (Default)

```tsx
// src/app/dashboard/page.tsx
// No "use client" - this is a Server Component

import { BudgetTable } from '@/components/budget/BudgetTable';

export default function DashboardPage() {
  // Can fetch data directly
  // Cannot use useState, useEffect, onClick, etc.

  return (
    <div>
      <h1>CAPEX Budget Dashboard</h1>
      <BudgetTable />  {/* Client Component */}
    </div>
  );
}
```

### Client Components

```tsx
// src/components/budget/BudgetTable.tsx
'use client';

import { useState, useEffect } from 'react';

export function BudgetTable() {
  const [data, setData] = useState<BudgetData | null>(null);
  const [filters, setFilters] = useState<Filters>(defaultFilters);

  // Client-side data fetching
  useEffect(() => {
    fetchBudgetData(filters).then(setData);
  }, [filters]);

  return (
    <div onClick={() => { /* OK in client component */ }}>
      {/* ... */}
    </div>
  );
}
```

## Dynamic Imports

For components that use browser-only APIs (like MSAL.js):

```tsx
// Wrong - breaks SSR
import { msalInstance } from '@/lib/providers/dataverse/msal-browser';

// Correct - dynamic import with ssr: false
import dynamic from 'next/dynamic';

const BudgetTable = dynamic(
  () => import('@/components/budget/BudgetTable').then(mod => mod.BudgetTable),
  {
    ssr: false,
    loading: () => <TableSkeleton />,
  }
);

export default function Page() {
  return <BudgetTable />;
}
```

## API Routes

### Basic Route Handler

```typescript
// src/app/api/dataverse/budget/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  // Get auth token from cookie
  const token = cookies().get('dataverse_token')?.value;

  if (!token) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  // Get query params
  const searchParams = request.nextUrl.searchParams;
  const year = searchParams.get('year');
  const quarter = searchParams.get('quarter');

  try {
    const data = await fetchBudgetFromDataverse(token, { year, quarter });
    return NextResponse.json(data);
  } catch (error) {
    console.error('Budget fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch budget data' },
      { status: 500 }
    );
  }
}
```

### Protected Route Pattern

```typescript
// src/lib/api/middleware.ts
import { cookies } from 'next/headers';

export async function requireAuth() {
  const token = cookies().get('dataverse_token')?.value;

  if (!token) {
    return {
      success: false,
      response: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  return { success: true, token };
}

// Usage in route
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.success) return auth.response;

  // Use auth.token
}
```

## Layouts

### Root Layout

```tsx
// src/app/layout.tsx
import { AuthProvider } from '@/components/providers/AuthProvider';
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

### Dashboard Layout

```tsx
// src/app/dashboard/layout.tsx
import { Sidebar } from '@/components/Sidebar';
import { Header } from '@/components/Header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
```

## Middleware

```typescript
// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('dataverse_token');
  const isAuthPage = request.nextUrl.pathname.startsWith('/auth');
  const isApiRoute = request.nextUrl.pathname.startsWith('/api');
  const isPublicRoute = request.nextUrl.pathname === '/';

  // Allow API routes and public pages
  if (isApiRoute || isPublicRoute || isAuthPage) {
    return NextResponse.next();
  }

  // Redirect to login if no token
  if (!token) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
```

## Data Fetching Patterns

### Server-Side with Suspense

```tsx
// src/app/dashboard/page.tsx
import { Suspense } from 'react';

export default function DashboardPage() {
  return (
    <Suspense fallback={<TableSkeleton />}>
      <BudgetTableWrapper />
    </Suspense>
  );
}

async function BudgetTableWrapper() {
  const data = await fetchBudgetData();
  return <BudgetTable initialData={data} />;
}
```

### Client-Side with SWR

```tsx
'use client';

import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function useBudgetData(filters: Filters) {
  const params = new URLSearchParams(filters);

  return useSWR<BudgetData>(
    `/api/dataverse/budget?${params}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 minute
    }
  );
}
```

## Loading States

```tsx
// src/app/dashboard/loading.tsx
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-48 mb-4" />
      <div className="h-64 bg-gray-200 rounded" />
    </div>
  );
}
```

## Error Handling

```tsx
// src/app/dashboard/error.tsx
'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <h2 className="text-xl font-semibold mb-4">Something went wrong!</h2>
      <p className="text-gray-600 mb-4">{error.message}</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg"
      >
        Try again
      </button>
    </div>
  );
}
```

## Environment Variables

```typescript
// Client-side (NEXT_PUBLIC_ prefix required)
process.env.NEXT_PUBLIC_DATAVERSE_URL
process.env.NEXT_PUBLIC_AZURE_CLIENT_ID

// Server-side only
process.env.AZURE_CLIENT_SECRET
process.env.DATAVERSE_ADMIN_TOKEN
```
