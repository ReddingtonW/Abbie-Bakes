/**
 * POST /api/order
 *
 * Cloudflare Pages Function (runs on the Workers runtime, deploys with the site).
 * Receives the order form, then uses Resend to send:
 *   1. a notification to Abbie (reply-to is the customer), and
 *   2. an automatic confirmation to the customer.
 *
 * Configuration comes from environment variables, never from this file.
 * See functions/README.md for setup.
 *
 *   RESEND_API_KEY   (secret)   Resend API key
 *   NOTIFY_EMAIL                inbox that receives new requests
 *   FROM_EMAIL       (optional) default: Baked by Abbie <orders@baked-by-abbie.co.uk>
 *   REPLY_TO_EMAIL   (optional) where customer replies to the confirmation go
 *                               default: hello@abbiebakes.com
 *   SITE_URL         (optional) default: https://baked-by-abbie.co.uk (used for the logo in emails)
 */

const DEFAULT_FROM = 'Baked by Abbie <orders@baked-by-abbie.co.uk>';
const DEFAULT_REPLY_TO = 'hello@abbiebakes.com';
const DEFAULT_SITE_URL = 'https://baked-by-abbie.co.uk';

const MAX_BODY_BYTES = 20000;
const MAX = { short: 80, name: 100, email: 254, phone: 40, notes: 2000 };

const BRAND = {
  cream: '#FBF5EA',
  caramel: '#D0A064',
  chocolate: '#44291A',
  toffee: '#8C5420',
  line: '#E6D8C2',
};

/* ---------------------------------------------------------------- helpers */

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

// Strip control characters (keeps tab and newline), trim, cap the length.
const clean = (value, max) =>
  String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);

// For anything that ends up in a subject line or name: one line only.
const oneLine = (value, max) => clean(value, max).replace(/\s+/g, ' ');

const EMAIL_RE = /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]{2,}$/;

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

const formatDate = (date) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);

function daysUntil(date, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((date.getTime() - today) / 86400000);
}

// Browsers always send Origin on form posts. Refuse other sites posting to us.
function isSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------- validation */

function readOrder(form, now = new Date()) {
  const order = {
    product: oneLine(form.get('product-type'), MAX.short),
    cakeFlavour: oneLine(form.get('cake-flavour'), MAX.short),
    cupcakeSize: oneLine(form.get('cupcake-size'), MAX.short),
    cupcakeFlavour: oneLine(form.get('cupcake-flavour'), MAX.short),
    dateRaw: oneLine(form.get('date-needed'), 10),
    name: oneLine(form.get('full-name'), MAX.name),
    email: oneLine(form.get('email'), MAX.email),
    phone: oneLine(form.get('phone'), MAX.phone),
    notes: clean(form.get('notes'), MAX.notes),
  };

  if (!order.product) return { error: 'Please choose cake or cupcakes.' };
  if (!order.name) return { error: 'Please add your name.' };
  if (!EMAIL_RE.test(order.email)) return { error: 'Please check your email address.' };

  const date = parseDate(order.dateRaw);
  if (!date) return { error: 'Please choose the date you need it for.' };
  if (daysUntil(date, now) < 0) return { error: 'That date has already passed.' };
  order.date = date;
  order.daysAway = daysUntil(date, now);

  return { order };
}

// [label, value] pairs, in the order Abbie reads them, empty ones dropped.
function summaryRows(order) {
  return [
    ['Ordering', order.product],
    ['Flavour', order.cakeFlavour || order.cupcakeFlavour],
    ['Box size', order.cupcakeSize],
    ['Needed for', formatDate(order.date)],
    ['Name', order.name],
    ['Email', order.email],
    ['Phone', order.phone],
    ['Notes', order.notes],
  ].filter(([, value]) => value);
}

/* ----------------------------------------------------------------- emails */

function layout({ siteUrl, preheader, heading, bodyHtml }) {
  const logo = `${siteUrl.replace(/\/$/, '')}/images/logo/baked-by-abbie_horizontal_light.png`;
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:${BRAND.cream};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.cream};">
<tr><td align="center" style="padding:28px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
    <tr><td style="padding:0 0 22px;">
      <img src="${escapeHtml(logo)}" width="180" height="40" alt="Baked by Abbie" style="display:block;border:0;height:40px;width:auto;">
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${BRAND.line};border-radius:16px;padding:28px 26px;font-family:'Josefin Sans','Trebuchet MS',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:${BRAND.chocolate};">
      <h1 style="margin:0 0 14px;font-size:24px;line-height:1.2;font-weight:600;color:${BRAND.chocolate};">${escapeHtml(heading)}</h1>
      ${bodyHtml}
    </td></tr>
    <tr><td style="padding:18px 4px 0;font-family:'Trebuchet MS',Helvetica,Arial,sans-serif;font-size:13px;color:#695244;">
      Baked by Abbie &middot; home-baked cakes and cupcakes, made to order in Greater Manchester
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

function summaryTable(rows) {
  const cells = rows
    .map(
      ([label, value]) => `<tr>
        <td style="padding:9px 14px 9px 0;border-top:1px solid ${BRAND.line};color:#695244;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>
        <td style="padding:9px 0;border-top:1px solid ${BRAND.line};font-weight:600;vertical-align:top;white-space:pre-wrap;">${escapeHtml(value)}</td>
      </tr>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:14px 0 4px;border-bottom:1px solid ${BRAND.line};">${cells}</table>`;
}

const summaryText = (rows) => rows.map(([label, value]) => `${label}: ${value}`).join('\n');

function notificationEmail(order, env) {
  const rows = summaryRows(order);
  const leadNote =
    order.daysAway < 28
      ? `<p style="margin:14px 0 0;padding:12px 14px;background:#EBD5B7;border-radius:10px;">Heads up: this date is only ${order.daysAway} day${order.daysAway === 1 ? '' : 's'} away, which is under your 4 weeks' notice.</p>`
      : '';
  const subject = `New quote request: ${order.product}, ${order.name}`;
  const intro = `${order.name} has sent a quote request through the website. It is ${order.daysAway} day${order.daysAway === 1 ? '' : 's'} until they need it.`;

  return {
    from: env.FROM_EMAIL || DEFAULT_FROM,
    to: [env.NOTIFY_EMAIL],
    reply_to: order.email,
    subject,
    html: layout({
      siteUrl: env.SITE_URL || DEFAULT_SITE_URL,
      preheader: intro,
      heading: 'New quote request',
      bodyHtml: `<p style="margin:0;">${escapeHtml(intro)}</p>
        ${summaryTable(rows)}
        ${leadNote}
        <p style="margin:18px 0 0;color:#695244;font-size:14px;">Just reply to this email to answer ${escapeHtml(order.name)} directly.</p>`,
    }),
    text: `${intro}\n\n${summaryText(rows)}\n\nReply to this email to answer ${order.name} directly.`,
  };
}

function confirmationEmail(order, env) {
  const rows = summaryRows(order).filter(([label]) => label !== 'Email');
  const first = order.name.split(' ')[0];
  const intro = `Thank you for your quote request. I've got it, and I'll be in touch by email soon.`;

  const steps = [
    `I'll look over your request and check your date. I need at least 4 weeks' notice.`,
    `I'll email you a quote and let you know whether I can bake for you on that day.`,
    `Once you're happy, I'll confirm your order and the collection details.`,
  ];

  return {
    from: env.FROM_EMAIL || DEFAULT_FROM,
    to: [order.email],
    reply_to: env.REPLY_TO_EMAIL || DEFAULT_REPLY_TO,
    subject: `Thanks ${first}, I've got your quote request`,
    html: layout({
      siteUrl: env.SITE_URL || DEFAULT_SITE_URL,
      preheader: intro,
      heading: `Thank you, ${first}`,
      bodyHtml: `<p style="margin:0 0 6px;">${escapeHtml(intro)}</p>
        <p style="margin:14px 0 6px;font-weight:600;">What happens next</p>
        <ol style="margin:0 0 8px;padding-left:20px;">${steps
          .map((s) => `<li style="margin:0 0 6px;">${escapeHtml(s)}</li>`)
          .join('')}</ol>
        <p style="margin:18px 0 0;font-weight:600;">What you sent me</p>
        ${summaryTable(rows)}
        <p style="margin:18px 0 0;">If anything's wrong, or you'd like to add something, just reply to this email.</p>
        <p style="margin:18px 0 0;font-weight:600;font-size:18px;">Abbie x</p>`,
    }),
    text: `Hi ${first},\n\n${intro}\n\nWhat happens next:\n${steps
      .map((s, i) => `${i + 1}. ${s}`)
      .join('\n')}\n\nWhat you sent me:\n${summaryText(rows)}\n\nIf anything's wrong, or you'd like to add something, just reply to this email.\n\nAbbie x`,
  };
}

async function sendEmail(env, payload) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Resend responded ${response.status}: ${detail.slice(0, 300)}`);
  }
}

/* --------------------------------------------------------------- handlers */

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return json({ error: 'Forbidden' }, 403);

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_BODY_BYTES) return json({ error: 'Request too large' }, 413);

  if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL) {
    console.error('order: RESEND_API_KEY or NOTIFY_EMAIL is not set');
    return json({ error: 'Server not configured' }, 500);
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }

  // Honeypot: humans never see this field. Pretend success so bots move on.
  if (clean(form.get('website'), 200)) return json({ ok: true });

  const { order, error } = readOrder(form);
  if (error) return json({ error }, 422);

  // The notification is the one that matters. If it fails, tell the customer
  // so nothing gets silently lost.
  try {
    await sendEmail(env, notificationEmail(order, env));
  } catch (err) {
    console.error('order: notification failed:', err.message);
    return json({ error: 'Could not send your request' }, 502);
  }

  // The confirmation is a courtesy. If it fails, the order has still arrived.
  try {
    await sendEmail(env, confirmationEmail(order, env));
  } catch (err) {
    console.error('order: confirmation failed:', err.message);
  }

  return json({ ok: true });
}

// Anything that is not a POST.
export async function onRequest() {
  return json({ error: 'Method not allowed' }, 405, { allow: 'POST' });
}
