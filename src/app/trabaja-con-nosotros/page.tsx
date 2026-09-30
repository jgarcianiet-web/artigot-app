import type { Metadata } from "next";
import { ApplyForm } from "./ApplyForm";

export const metadata: Metadata = { title: "Trabaja con nosotros · Artigot" };

export default function Apply() {
  return (
    <main className="mx-auto max-w-lg space-y-4 p-4 py-8">
      <div>
        <h1>Trabaja con nosotros</h1>
        <p className="text-sm text-stone-600">
          Buscamos camareros, maîtres y mozos para bodas y eventos. Déjanos tus datos y te llamaremos cuando haya servicios en tu zona.
        </p>
      </div>
      <ApplyForm />
    </main>
  );
}
