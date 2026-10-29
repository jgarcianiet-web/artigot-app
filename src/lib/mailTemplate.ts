import { appUrl } from "./domain";

/**
 * Plantilla HTML de los emails de Artigot: cabecera con el logo, el mensaje en una tarjeta blanca, un recuadro con
 * datos destacados (p. ej. usuario y código), un botón y un pie con los datos de la empresa. Hecha con tablas y
 * estilos en línea para que se vea igual en Gmail, Outlook y el móvil.
 */

export type MailButton = { label: string; url: string };
export type MailOptions = {
  /** Botón principal (p. ej. «Entrar en la app») */
  button?: MailButton;
  /** Datos destacados en un recuadro, como «Código: 123456» */
  box?: [string, string][];
  /** Texto después del recuadro y el botón */
  after?: string;
};
export type MailCompany = { name: string; cif: string; address: string; city: string };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const INK = "#1c1917";
const MUTED = "#57534e";
const FONT = "font-family:Helvetica,Arial,sans-serif";

/** Párrafos y listas (líneas que empiezan por «• ») con los enlaces clicables. */
function paragraphs(text: string) {
  const link = (l: string) => esc(l).replace(/(https?:\/\/[^\s<]+)/g, `<a href="$1" style="color:${INK};text-decoration:underline">$1</a>`);
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul style="margin:0 0 14px;padding-left:20px">${list.map((li) => `<li style="margin:0 0 4px">${li}</li>`).join("")}</ul>`);
    list = [];
  };
  for (const l of text.split("\n")) {
    if (l.startsWith("• ")) list.push(link(l.slice(2)));
    else {
      flush();
      if (l.trim()) out.push(`<p style="margin:0 0 14px">${link(l)}</p>`);
    }
  }
  flush();
  return out.join("");
}

/** El texto plano equivalente (para los programas de correo que no muestran HTML). */
export function mailText(text: string, o: MailOptions) {
  return [text, o.box?.map(([k, v]) => `${k}: ${v}`).join("\n"), o.button && `${o.button.label}: ${o.button.url}`, o.after].filter(Boolean).join("\n\n");
}

export function mailHtml(subject: string, text: string, o: MailOptions, company: MailCompany) {
  const name = company.name || "Artigot Catering";
  const box = o.box?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;background:#f5f5f4;border-radius:10px"><tr><td style="padding:16px 20px">${o.box
        .map(
          ([k, v]) =>
            `<div style="margin:4px 0"><span style="font-size:13px;color:${MUTED}">${esc(k)}</span><br><span style="font-size:20px;font-weight:bold;letter-spacing:1px;color:${INK}">${esc(v)}</span></div>`,
        )
        .join("")}</td></tr></table>`
    : "";
  const button = o.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 22px"><tr><td style="background:${INK};border-radius:8px"><a href="${esc(o.button.url)}" style="display:inline-block;padding:13px 26px;${FONT};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none">${esc(o.button.label)}</a></td></tr></table>`
    : "";
  const address = [company.address, company.city].filter(Boolean).join(" · ");
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f4">
<div style="display:none;max-height:0;overflow:hidden">${esc(text.split("\n").find((l) => l.trim()) ?? subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f4"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e7e5e4">
<tr><td align="center" style="padding:28px 32px 22px;border-bottom:3px solid ${INK}">
<img src="${appUrl()}/logo.png" width="190" alt="${esc(name)}" style="display:block;width:190px;max-width:60%;height:auto;border:0">
</td></tr>
<tr><td style="padding:30px 32px 12px;${FONT};font-size:15px;line-height:1.6;color:${INK}">
<h1 style="margin:0 0 18px;font-size:20px;line-height:1.3;color:${INK}">${esc(subject)}</h1>
${paragraphs(text)}${box}${button}${o.after ? paragraphs(o.after) : ""}
<p style="margin:8px 0 18px;color:${MUTED}">Un saludo,<br><strong style="color:${INK}">Equipo de RRHH · ${esc(name)}</strong></p>
</td></tr>
<tr><td style="padding:18px 32px 24px;background:#fafaf9;border-top:1px solid #e7e5e4;${FONT};font-size:12px;line-height:1.5;color:#78716c" align="center">
<strong style="color:${MUTED}">${esc(name)}</strong>${company.cif ? ` · CIF ${esc(company.cif)}` : ""}${address ? `<br>${esc(address)}` : ""}<br>
Este email se ha enviado desde la app de personal de ${esc(name)}.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}
