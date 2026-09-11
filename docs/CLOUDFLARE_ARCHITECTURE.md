# Kora OS Cloudflare Edge Architecture

Status: implementation plan. No Cloudflare zone, nameserver, WAF, or DNS
changes are made by this repository change.

## Request flow

```text
Browser -> Cloudflare DNS/proxy/WAF/TLS -> Vercel (web)
                                      -> Railway (API)
                                      -> Resend HTTPS (outbound email only)
```

The intended public host map is:

| Host | Origin | Normal mode |
| --- | --- | --- |
| `koraafric.com` | Vercel | proxied |
| `www.koraafric.com` | Vercel | proxied |
| `api.koraafric.com` | Railway | proxied |

PostgreSQL remains private to Railway. Resend remains an outbound HTTPS
provider. Google Workspace and Resend DNS records remain DNS-only.

## Application changes

Production CORS now allows only `https://koraafric.com` and
`https://www.koraafric.com`; localhost remains available outside production.
The API can use Cloudflare's `CF-Connecting-IP` for `req.ip` only when the
TCP peer matches the explicitly configured `CLOUDFLARE_TRUSTED_PROXY_CIDRS`.
With no configured ranges, the application trusts no forwarding header. This
keeps OTP/IP rate limits safe before the Cloudflare cutover and prevents a
direct caller from spoofing the header.

Set `CLOUDFLARE_TRUSTED_PROXY_CIDRS` to the current Cloudflare published IPv4
and IPv6 ranges in Railway only after the zone is proxied. Keep the value out
of application code and update it through the normal operations process when
Cloudflare publishes range changes.

## Security boundaries

- Kora authentication, tenant isolation, branch access, permissions, and
  Super Admin authorization remain authoritative at the API.
- Cloudflare Access, if added later, is an additional gate and never replaces
  Kora RBAC.
- No authenticated API response is cacheable at Cloudflare.
- WAF and rate limits are an outer abuse-control layer; NestJS throttles and
  domain limits remain in force.
- Health checks must remain reachable; do not challenge `/v1/health`.

## Current limitations

Managed Vercel and Railway origins may remain reachable through provider
hostnames. Cloudflare proxying therefore does not, by itself, guarantee that
all origin bypass paths are closed. See the DNS plan and runbook before
claiming Cloudflare-only ingress.

Cloudflare plan features vary. The proxy provides baseline edge TLS and
network-level DDoS absorption, while advanced WAF managed rules, granular rate
limiting, Bot Management, and analytics depth depend on the account plan.
Confirm the selected plan's limits before relying on any control as the sole
abuse barrier.
