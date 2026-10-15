/** Turns a plain-text message into the HTML email every agency sends. */

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Escapes, keeps line breaks and turns http(s) URLs into links. */
function paragraphs(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const html = escape(block)
        .replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#1d4ed8">${url}</a>`)
        .replace(/\n/g, '<br>');
      return `<p style="margin:0 0 16px">${html}</p>`;
    })
    .join('');
}

export function emailHtml(opts: { agencyName: string; body: string; logoUrl?: string | null }): string {
  const header = opts.logoUrl
    ? `<img src="${escape(opts.logoUrl)}" alt="${escape(opts.agencyName)}" style="max-height:48px;max-width:200px">`
    : `<strong style="font-size:18px">${escape(opts.agencyName)}</strong>`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f4f4f5;font-family:Helvetica,Arial,sans-serif;color:#1f2328">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px">
<tr><td style="padding:24px 28px 8px">${header}</td></tr>
<tr><td style="padding:8px 28px 12px;font-size:15px;line-height:1.55">${paragraphs(opts.body)}</td></tr>
</table>
<p style="font-size:12px;color:#6b7280;margin:16px 0 0">Enviado por ${escape(opts.agencyName)} con Rentavle.</p>
</td></tr></table>
</body></html>`;
}
