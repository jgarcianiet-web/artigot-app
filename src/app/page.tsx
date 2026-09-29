import { redirect } from "next/navigation";
import { currentViewer } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Punto de entrada de la web y de las apps: cada uno a su sitio. */
export default async function Home() {
  const viewer = await currentViewer();
  redirect(viewer?.kind === "admin" ? "/admin" : viewer ? "/app" : "/entrar");
}
