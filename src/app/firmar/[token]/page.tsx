import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Logo } from "@/components/Logo";
import { hasSession, isExpired, maskEmail, sessionCookie, signerByToken } from "@/lib/externalSign";
import { CodeStep, SignStep } from "./ExternalSign";

export const metadata: Metadata = { title: "Firmar documento · Artigot", robots: { index: false } };

const when = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "long", timeStyle: "short" });

/** Página pública para que una persona de fuera de la plataforma firme un documento con su enlace personal. */
export default async function ExternalSignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await signerByToken(token);
  const session = s ? hasSession(s, (await cookies()).get(sessionCookie(s.id))?.value) : false;
  return (
    <main className="mx-auto max-w-lg space-y-4 p-4 py-8">
      <Logo height={44} className="mb-4" />
      {!s ? (
        <div className="card space-y-1">
          <h1>Enlace no válido</h1>
          <p className="text-sm text-stone-600">Este enlace no existe o el documento se ha retirado. Si tenías que firmar algo, pide a RRHH de Artigot que te lo envíe de nuevo.</p>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <p className="text-sm text-stone-500">Documento para firmar · {s.name}</p>
            <h1>{s.request.title}</h1>
            <p className="text-sm text-stone-500">Te lo envía {s.request.createdBy}, de RRHH de Artigot Catering.</p>
          </div>
          {s.signedAt ? (
            <div className="card space-y-2 bg-emerald-50">
              <p className="text-emerald-900">✓ Lo firmaste el {when.format(s.signedAt)}. Te enviamos tu copia firmada por email.</p>
              {session && <a href={`/api/firma/${token}/pdf`} target="_blank" className="btn">Ver mi copia firmada</a>}
            </div>
          ) : isExpired(s) ? (
            <div className="card">
              <p className="text-sm">Este enlace ha caducado. Pide a RRHH de Artigot que te lo envíe de nuevo.</p>
            </div>
          ) : !session ? (
            <CodeStep token={token} email={maskEmail(s.email)} sent={!!s.codeHash} />
          ) : (
            <>
              {s.request.message && <article className="card text-sm leading-relaxed whitespace-pre-line">{s.request.message}</article>}
              <a href={`/api/firma/${token}/pdf`} target="_blank" className="btn btn-primary w-full">📄 Leer el documento</a>
              <p className="text-sm text-stone-600">Léelo entero. Después firma con el dedo (o con el ratón) en el recuadro.</p>
              <SignStep token={token} />
            </>
          )}
        </>
      )}
      <p className="text-center text-xs text-stone-400">Firma electrónica de Artigot Catering · tu copia firmada lleva la fecha, la hora y la huella del documento.</p>
    </main>
  );
}
