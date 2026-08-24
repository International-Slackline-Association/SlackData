// The /admin route's entry point, and the reason it is a file of its own.
//
// `AdminAuthProvider` pulls in react-oidc-context + oidc-client-ts — ~60 KB raw
// (~15 KB gzipped) that only an administrator ever executes. Imported statically
// from App.tsx it lands in the single main chunk, so every visitor to every gear
// page downloads it; App.tsx lazy-imports this module instead, which is what
// actually makes that comment true.
//
// It was previously true only by accident: with the Cognito env vars empty,
// Rollup could prove the `<AuthProvider>` branch unreachable and drop the
// library. Filling them in — step 3 of infra/README.md § Turning Phase 2 on —
// silently put it back in everyone's bundle. Splitting here does not depend on
// how the deployment happens to be configured.

import AdminPage from '@/pages/AdminPage'
import { AdminAuthProvider } from '@/auth/AdminAuthProvider'

export default function AdminRoute() {
  return (
    <AdminAuthProvider>
      <AdminPage />
    </AdminAuthProvider>
  )
}
