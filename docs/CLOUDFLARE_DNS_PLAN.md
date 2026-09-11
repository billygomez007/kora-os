# Kora OS Cloudflare DNS Plan

This is a nameserver-cutover runbook, not an automatic DNS change. Record
values must be copied from the authoritative DNS provider, Vercel, Railway,
Google Workspace, and Resend before changing nameservers. Do not invent or
delete values from this document.

## Inventory before import

Capture the complete zone, including record name, type, value, TTL, and current
proxy state. Preserve every record that is not explicitly replaced:

- apex/root record for Vercel;
- `www` record for Vercel;
- `api` record for Railway;
- Google Workspace MX and verification TXT records;
- SPF TXT record(s);
- DKIM CNAME/TXT records;
- DMARC TXT record;
- Resend domain-verification, DKIM, and SPF records;
- Vercel and Railway verification records;
- any existing challenge, redirect, or subdomain records.

Use the DNS provider's export and independent lookups. A failed lookup is not
evidence that a record is safe to remove.

## Proxy classification

| Record | Target | Cloudflare mode | Reason |
| --- | --- | --- | --- |
| `@` / `koraafric.com` | existing Vercel target | Proxied | public web ingress |
| `www` | existing Vercel target | Proxied | public web ingress |
| `api` | existing Railway target | Proxied | public API ingress |
| MX records | existing Google Workspace targets | DNS only | mail delivery cannot be proxied |
| SPF TXT | existing value | DNS only | sender authorization |
| DKIM records | existing value | DNS only | mail signing/verification |
| DMARC TXT | existing value | DNS only | mail policy |
| Resend verification | existing value | DNS only | provider validation |
| Vercel/Railway verification | existing value | DNS only | provider validation |

The exact Vercel and Railway targets are intentionally not repeated here;
copy them from the active provider dashboards.

## Cutover order

1. Add the zone to Cloudflare and review the imported records.
2. Correct the proxy state using the table above; leave mail and verification
   records DNS-only.
3. Configure provider-specific TLS and confirm the origins before enforcing
   it: prefer **Full (strict)** for the Vercel-backed apex and `www` origins
   when their certificates validate; Railway may require **Full** for
   `api.koraafric.com` under Railway's Cloudflare-compatible configuration.
4. Change nameservers at the registrar to the two Cloudflare nameservers.
5. Wait for authoritative propagation and verify apex, `www`, and `api` over
   HTTPS from more than one resolver.
6. Enable DNSSEC only after the zone is stable; publish the Cloudflare DS
   record at the registrar.

Rollback is the registrar's previous nameserver pair plus the preserved zone
export. Do not delete the old DNS zone until mail and provider verification
have been observed through a complete operational window.
