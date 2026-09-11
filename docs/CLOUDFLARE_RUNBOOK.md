# Kora OS Cloudflare Operations Runbook

## Monitoring

Monitor Cloudflare WAF actions, rate-limit events, bot scores, 4xx/5xx rates,
origin errors, unusual countries/ASNs, and cache status. Correlate API
failures with Railway health/logs and web failures with Vercel deployments.
Never export OTPs, access tokens, refresh tokens, API keys, or authorization
headers to logs.

## Origin bypass

Vercel deployment URLs and Railway provider hostnames may remain directly
reachable. Verify whether provider access controls, custom-domain host
validation, or private networking can safely restrict them. Do not block
provider health checks before confirming the deployment path. Until that work
is complete, report Cloudflare bypass as a residual risk rather than claiming
Cloudflare-only ingress.

## Super Admin

Cloudflare Access may later add identity-aware gating to `/super-admin`, but it
must sit in front of and never replace Kora's Super Admin authentication,
permissions, tenant checks, or audit trail. Start with Kora authorization only.

## Incident response

1. Check whether the failure is edge, origin, or application authorization.
2. Put a new WAF rule in Log/Challenge before Block unless active exploitation
   requires emergency blocking.
3. Preserve request IDs and Cloudflare Ray IDs without collecting secrets.
4. If an origin is unhealthy, pause the affected rule and restore the last
   known-good Vercel/Railway deployment through its normal provider workflow.
5. Roll back DNS by restoring the previous nameservers only after confirming
   the preserved zone export and mail records.
