/**
 * POST /api/contact
 * Accepts the public enquiry form (plain HTML POST, no JS required) and
 * delivers it by email via Resend.
 *
 * - Validates required fields server-side (name, email, message).
 * - Honeypot: a filled "botcheck" field gets a fake success redirect and
 *   nothing is sent.
 * - Rate-limited per IP via lib/rate-limit (in-memory, best-effort — same
 *   trade-off as /api/login).
 * - On success: 303 redirect to /thank-you/.
 * - On failure: a small self-contained HTML page explaining the problem,
 *   with a link back to the form and direct contact details — no silent
 *   drops. Clients that ask for JSON (Accept: application/json) get JSON.
 *
 * Env vars:
 *   RESEND_API_KEY     — Resend API key
 *   CONTACT_TO_EMAIL   — where enquiries are delivered
 *   CONTACT_FROM_EMAIL — verified sender (use onboarding@resend.dev until
 *                        the scalderhurst.co.uk domain is verified)
 *   CONTACT_CC_EMAIL   — optional CC
 */
import { checkLimit, recordFailure, clientIp } from '../lib/rate-limit.js';

// 5 submissions per 15 minutes per IP is generous for humans and cheap
// enough for a spam run to be pointless.
const SUBMIT_LIMIT = { windowMs: 15 * 60 * 1000, max: 5 };

const MAX_LENGTHS = {
  name: 200,
  email: 320,
  phone: 50,
  company: 200,
  service: 100,
  subject: 200,
  message: 5000,
};

function field(body, name) {
  const v = body ? body[name] : undefined;
  if (v == null) return '';
  return String(v).trim().slice(0, MAX_LENGTHS[name] || 200);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wantsJson(req) {
  return /\bapplication\/json\b/i.test(req.headers.accept || '');
}

/**
 * Minimal self-contained error page (no external assets — it must render
 * even if the rest of the site is unreachable). Static markup + escaped
 * message only.
 */
function errorPage(title, message) {
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)} — Scalderhurst</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; background: #f6f7f9; color: #1a2233; margin: 0; padding: 2rem 1rem; }
  main { max-width: 34rem; margin: 3rem auto; background: #fff; border-radius: 8px; padding: 2rem; box-shadow: 0 1px 4px rgba(16, 24, 40, .08); }
  h1 { font-size: 1.4rem; margin-top: 0; }
  a { color: #2563eb; }
</style>
</head>
<body>
<main>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(message)}</p>
  <p><a href="/contact/">Go back to the enquiry form</a> and try again.</p>
  <p>You can also reach us directly on <a href="tel:+441233840711">+44 (0)1233 840711</a>
     or at <a href="mailto:info@scalderhurst.co.uk">info@scalderhurst.co.uk</a>.</p>
</main>
</body>
</html>`;
}

function fail(req, res, status, title, message) {
  if (wantsJson(req)) {
    return res.status(status).json({ error: message });
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(status).send(errorPage(title, message));
}

function redirectToThanks(res) {
  res.setHeader('Location', '/thank-you/');
  return res.status(303).end();
}

const SERVICE_LABELS = {
  'board-packaging': 'Board & Packaging',
  'conversion': 'Conversion',
  'warehousing-logistics': 'Warehousing & Logistics',
  'general': 'General Enquiry',
};

function enquiryEmail({ name, email, phone, company, service, subject, message }) {
  const rows = [
    ['Name', name],
    ['Email', email],
    ['Phone', phone || '—'],
    ['Company', company || '—'],
    ['Service', SERVICE_LABELS[service] || service || '—'],
    ['Subject', subject || '—'],
  ]
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:6px 12px 6px 0;color:#5b6474;white-space:nowrap;vertical-align:top;">${label}</td>
        <td style="padding:6px 0;color:#1a2233;">${escapeHtml(value)}</td>
      </tr>`
    )
    .join('');

  const html = `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#1a2233;">
  <div style="border-bottom:3px solid #2563eb;padding:16px 0;margin-bottom:16px;">
    <strong style="font-size:18px;">Scalderhurst</strong>
    <span style="color:#5b6474;"> — website enquiry</span>
  </div>
  <table style="border-collapse:collapse;font-size:14px;">${rows}</table>
  <div style="margin-top:16px;padding:16px;background:#f6f7f9;border-radius:6px;font-size:14px;white-space:pre-wrap;">${escapeHtml(message)}</div>
  <p style="color:#8a92a3;font-size:12px;margin-top:16px;">
    Sent from the enquiry form at www.scalderhurst.co.uk. Reply to this email to respond directly to the enquirer.
  </p>
</div>`;

  const text = [
    'Website enquiry — Scalderhurst',
    '',
    `Name:    ${name}`,
    `Email:   ${email}`,
    `Phone:   ${phone || '-'}`,
    `Company: ${company || '-'}`,
    `Service: ${SERVICE_LABELS[service] || service || '-'}`,
    `Subject: ${subject || '-'}`,
    '',
    message,
  ].join('\n');

  return { html, text };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(req, res, 405, 'Method not allowed', 'This address only accepts form submissions.');
  }

  const body = req.body || {};

  // Honeypot — bots that fill it get a convincing success and nothing sent.
  if (field(body, 'botcheck') || body.botcheck === 'on') {
    return redirectToThanks(res);
  }

  const ip = clientIp(req);
  const gate = checkLimit(ip, SUBMIT_LIMIT);
  if (!gate.ok) {
    return fail(
      req, res, 429,
      'Too many enquiries',
      `We have received several enquiries from your connection in a short time. Please try again in ${Math.ceil(gate.retryAfter / 60)} minutes, or call us instead.`
    );
  }

  const name = field(body, 'name');
  const email = field(body, 'email');
  const message = field(body, 'message');
  if (!name || !email || !message) {
    return fail(req, res, 422, 'Missing details', 'Please fill in your name, email address and message, then send again.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail(req, res, 422, 'Email address not recognised', 'The email address does not look right. Please check it and send again.');
  }

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL;
  const fromEmail = process.env.CONTACT_FROM_EMAIL;
  const ccEmail = process.env.CONTACT_CC_EMAIL;
  if (!apiKey || !toEmail || !fromEmail) {
    console.error('[api/contact] Missing config: RESEND_API_KEY, CONTACT_TO_EMAIL, CONTACT_FROM_EMAIL');
    return fail(req, res, 500, 'Enquiry could not be sent', 'The enquiry service is not configured. Please email or call us directly.');
  }

  const enquiry = {
    name,
    email,
    phone: field(body, 'phone'),
    company: field(body, 'company'),
    service: field(body, 'service'),
    subject: field(body, 'subject'),
    message,
  };
  const { html, text } = enquiryEmail(enquiry);

  const payload = {
    from: `Scalderhurst Website <${fromEmail}>`,
    to: toEmail.split(',').map((s) => s.trim()).filter(Boolean),
    reply_to: email,
    subject: `Website enquiry: ${enquiry.subject || SERVICE_LABELS[enquiry.service] || 'General'} — ${name}`,
    html,
    text,
  };
  if (ccEmail) payload.cc = ccEmail.split(',').map((s) => s.trim()).filter(Boolean);

  // Count the attempt against the rate limit whether or not Resend accepts
  // it, so retries can't be used to spam.
  recordFailure(ip, SUBMIT_LIMIT);

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resendRes.ok) {
      const detail = await resendRes.text();
      console.error(`[api/contact] Resend ${resendRes.status}: ${detail}`);
      return fail(
        req, res, 502,
        'Enquiry could not be sent',
        'Something went wrong sending your enquiry. Please try again in a few minutes, or email or call us directly.'
      );
    }
  } catch (err) {
    console.error('[api/contact]', err.message);
    return fail(
      req, res, 502,
      'Enquiry could not be sent',
      'Something went wrong sending your enquiry. Please try again in a few minutes, or email or call us directly.'
    );
  }

  if (wantsJson(req)) return res.status(200).json({ ok: true });
  return redirectToThanks(res);
}
