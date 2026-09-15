// SEC-03 prerequisite: protected entry-point inventory (Objective 6).
//
// Cookie bootstrap remains OFF in this slice. The goal here is narrower: no
// protected route should read a refresh token (legacy localStorage key or
// the future __Host-kora_refresh cookie) directly — access must always go
// through the shared lib/auth/session.ts and lib/auth/store.ts abstraction,
// so a future cookie-first cutover only has to change that one module, not
// every page that currently exists.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const REPO_ROOT = path.resolve(new URL("..", import.meta.url).pathname);

// Every entry point a signed-in (or signing-in) user can land on that is
// not itself part of the sanctioned auth abstraction.
const PROTECTED_ENTRY_POINTS = [
  "src/components/workspace/WorkspaceShell.tsx",
  "src/app/onboarding/page.tsx",
  "src/app/customer-onboarding/page.tsx",
  "src/app/invite/[token]/page.tsx",
  "src/app/super-admin/layout.tsx",
  "src/app/super-admin/page.tsx",
  "src/app/app/page.tsx",
  "src/app/app/customers/page.tsx",
  "src/app/app/appointments/page.tsx",
  "src/app/app/transactions/page.tsx",
  "src/app/app/queue/page.tsx",
  "src/app/app/services/page.tsx",
  "src/app/app/reports/page.tsx",
  "src/app/app/payments/page.tsx",
  "src/app/app/settings/page.tsx",
  "src/app/app/staff/page.tsx",
  "src/app/app/qr/page.tsx",
];

const FORBIDDEN_PATTERNS = [
  /refreshToken/,
  /__Host-kora_refresh/,
  /kora\.auth\.session/,
];

for (const relativePath of PROTECTED_ENTRY_POINTS) {
  test(`REGRESSION: ${relativePath} never reads a refresh token or the raw legacy session key directly`, async () => {
    const source = await readFile(path.join(REPO_ROOT, relativePath), "utf8");

    for (const pattern of FORBIDDEN_PATTERNS) {
      assert.doesNotMatch(
        source,
        pattern,
        `${relativePath} must go through lib/auth/session.ts, not read ${pattern} directly`,
      );
    }
  });
}

test("the shared workspace bootstrap gate is the single place that reads the in-memory auth snapshot for workspace routing", async () => {
  const source = await readFile(
    path.join(REPO_ROOT, "src/components/workspace/WorkspaceShell.tsx"),
    "utf8",
  );

  assert.match(source, /useAuthSnapshot/);
  assert.match(source, /workspaceAuthGate|bootstrapAuth/);
});
