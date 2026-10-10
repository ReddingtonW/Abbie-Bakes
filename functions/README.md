# Order form function

`functions/api/order.js` is a Cloudflare Pages Function (it runs on the Workers
runtime and deploys automatically with the site). The order form posts to
`/api/order`, and the function uses [Resend](https://resend.com) to send:

1. **A notification to Abbie** with the request. Replying to it replies to the customer.
2. **An automatic confirmation to the customer**, in Abbie's voice, with what they sent.

If the notification fails, the customer sees an error and can try again, so
nothing is lost silently. If only the confirmation fails, the order still counts as sent.

Because the function lives on the same site as the form, there is no cross-site
setup, and it works on branch preview URLs as well as the live domain.

## Settings

Set these in Cloudflare: **Workers & Pages → abbie-bakes → Settings → Variables and Secrets**.
Add them for both **Production** and **Preview**. Changes only apply to the next deployment.

| Name | Type | Required | What it is |
|---|---|---|---|
| `RESEND_API_KEY` | Secret | Yes | Resend API key (sending access only) |
| `NOTIFY_EMAIL` | Text | Yes | Inbox that receives new quote requests (Abbie's) |
| `FROM_EMAIL` | Text | No | Defaults to `Baked by Abbie <orders@baked-by-abbie.co.uk>` |
| `REPLY_TO_EMAIL` | Text | No | Where customer replies to the confirmation go. Defaults to `hello@abbiebakes.com` |
| `SITE_URL` | Text | No | Defaults to `https://baked-by-abbie.co.uk` (used for the logo in emails) |

The inbox address is deliberately not in the code, because this repository is public.

## One-off setup

1. **Resend:** create an account, then add the domain `baked-by-abbie.co.uk`.
   Resend lists the DNS records to add. Add them in Cloudflare (DNS), then wait for the domain to show as verified.
2. **API key:** in Resend, create a key with sending access, ideally limited to that domain.
3. **Cloudflare:** add the settings above, then redeploy so they take effect.
4. **Test on the preview:** push the branch, open its preview address, send a test order
   with an email address you can read, and check both emails arrive (also check spam).
5. **Go live:** merge to `main`. Formspree can then be switched off.

## Good to know

- `orders@baked-by-abbie.co.uk` is send-only. To receive mail at it, add an address in
  Cloudflare Email Routing. Until then, customer replies go to `REPLY_TO_EMAIL`.
- Each order sends two emails. Check Resend's current free-plan limits against expected volume.
- Spam protection today is a hidden honeypot field plus input checks and an own-site-only check.
  If spam gets through, add a rate-limiting rule for `/api/order` in Cloudflare, or Turnstile.
- To roll back, point the form's `action` back at the Formspree address.
- `.md` files in this folder are ignored by Pages routing. Only `.js` files become endpoints.
