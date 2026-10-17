import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { requireWorker } from "@/lib/auth";
import { formatDate } from "@/lib/domain";
import { MIN_AGE, minorStatus, tutorText } from "@/lib/minors";
import { FixBirthDate, TutorForm } from "./TutorForm";

export const dynamic = "force-dynamic";

/** Trabajadores de 16 o 17 años: no pueden usar la app hasta que su padre, madre o tutor firme la autorización. */
export default async function TutorAuthorization() {
  const me = await requireWorker();
  const status = await minorStatus(me);
  if (!status || status.state === "authorized") redirect("/app");
  return (
    <main className="mx-auto max-w-lg space-y-4 p-4 pb-16">
      <div className="flex justify-center py-2"><Logo height={30} /></div>
      {status.state === "too-young" ? (
        <>
          <h1>No puedes trabajar todavía</h1>
          <p className="card text-sm">
            Según tu fecha de nacimiento ({formatDate(me.birthDate!, { long: true })}) tienes {status.age} años. Para trabajar con nosotros hay que tener al menos {MIN_AGE} años. Si
            es un error, corrígela aquí o habla con RRHH.
          </p>
          <FixBirthDate value={me.birthDate!} />
        </>
      ) : (
        <>
          <h1>Autorización de tu padre, madre o tutor</h1>
          <p className="text-sm text-stone-600">
            Tienes {status.age} años. Para poder trabajar, tu padre, tu madre o tu tutor legal tiene que autorizarte: que lea el texto, ponga sus datos y firme aquí
            mismo, en tu móvil. Hasta entonces no puedes seguir en la app.
          </p>
          <article className="card text-sm leading-relaxed whitespace-pre-line">
            {await tutorText({ name: me.name, dni: me.dni, birthDate: me.birthDate! }, { name: "[Nombre del padre, madre o tutor]", dni: "[DNI]", relation: "Padre, madre o tutor legal" })}
          </article>
          <TutorForm />
          <FixBirthDate value={me.birthDate!} />
        </>
      )}
    </main>
  );
}
