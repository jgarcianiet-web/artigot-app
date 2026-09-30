import { db } from "@/lib/db";
import { LoginForm, SetupForm } from "./LoginForms";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const firstRun = (await db.adminUser.count()) === 0;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">{firstRun ? <SetupForm /> : <LoginForm />}</main>
  );
}
