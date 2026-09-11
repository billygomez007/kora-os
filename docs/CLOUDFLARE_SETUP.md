# Kora OS Cloudflare Setup

Perform these actions manually in the Cloudflare dashboard. No API token or
account credential belongs in this repository.

1. **Websites → Add a site:** add `koraafric.com` and choose the appropriate
   plan. Review the imported zone before continuing.
2. **DNS → Records:** confirm the apex, `www`, and `api` records target the
   existing Vercel/Railway origins and are proxied. Confirm MX, SPF, DKIM,
   DMARC, Resend, Vercel, and Railway verification records are DNS-only.
3. **SSL/TLS → Overview:** use provider-specific origin settings. Prefer
   **Full (strict)** for the Vercel-backed apex and `www` origins once their
   certificates validate. Railway may require **Full** (rather than Full
   (strict)) for `api.koraafric.com` under Railway's Cloudflare-compatible
   configuration; confirm the active Railway certificate before enforcing it.
4. **SSL/TLS → Edge Certificates:** enable **Always Use HTTPS**. Enable
   Automatic HTTPS Rewrites only after checking the web build for mixed
   content. Delay HSTS until HTTPS is stable and rollback has been tested.
5. **Rules → Cache Rules:** bypass cache for `/v1/*`, authorization headers,
   Kora cookies, and all private workspace paths. Cache only immutable static
   assets and reviewed public images.
6. **Security → WAF → Managed rules:** enable the managed ruleset in Log or
   Managed Challenge mode first, then review events before blocking.
7. **Security → WAF → Custom rules:** add narrow protections for auth and
   obviously malicious requests while keeping `/v1/health` available.
8. **Security → WAF → Rate limiting rules:** add the conservative limits in
   `CLOUDFLARE_WAF_RULES.md`; do not remove NestJS limits.
9. **Security → Bots:** start with conservative bot protection for OTP,
   discovery, booking, and QR routes. Monitor false positives.
10. **DNS → Settings → DNSSEC:** after propagation and mail verification are
    stable, enable DNSSEC and publish the displayed DS record at the registrar.
11. **Railway variables:** after proxying is live, set the current Cloudflare
    proxy CIDR list in `CLOUDFLARE_TRUSTED_PROXY_CIDRS`. Do not place Cloudflare
    API tokens in the app or repository.
12. **Verify:** test web pages, API health, CORS from both production web
    origins, OTP delivery, login, mail delivery, and a representative public
    booking/QR flow. Keep the previous nameservers available for rollback.
