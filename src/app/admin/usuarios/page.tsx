import { toggleAdminUser } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { currentAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { ChangeMyPasswordForm, NewUserForm, ResetPasswordForm } from "./UserForms";
import { TestMailForm } from "./TestMailForm";

const when = new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" });

export default async function AdminUsers() {
  const me = (await currentAdmin())!;
  const users = await db.adminUser.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
  return (
    <div className="space-y-4">
      <div>
        <h1>Usuarios de RRHH</h1>
        <p className="text-sm text-stone-500">Todos los usuarios de RRHH tienen acceso completo a la aplicación.</p>
      </div>
      <TestMailForm email={me.email} />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Email</th>
                <th>Último acceso</th>
                <th>Contraseña</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.active ? "" : "opacity-50"}>
                  <td className="font-medium">
                    {u.name} {u.id === me.id && <span className="text-xs text-stone-500">(tú)</span>}
                    {!u.active && <div className="text-xs text-red-600">Desactivado</div>}
                  </td>
                  <td>{u.email}</td>
                  <td className="whitespace-nowrap text-stone-500">{u.lastLoginAt ? when.format(u.lastLoginAt) : "Nunca"}</td>
                  <td>{u.id !== me.id && u.active && <ResetPasswordForm id={u.id} />}</td>
                  <td>
                    {u.id !== me.id && (
                      <form action={toggleAdminUser.bind(null, u.id)}>
                        <SubmitButton className="btn btn-sm">{u.active ? "Desactivar" : "Reactivar"}</SubmitButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-4">
          <NewUserForm />
          <ChangeMyPasswordForm />
        </div>
      </div>
    </div>
  );
}
