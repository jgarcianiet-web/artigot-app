import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Plantilla de Excel para importar el personal. */
export async function GET() {
  if (!(await isAdmin())) return new NextResponse("No autorizado", { status: 401 });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Personal");
  ws.columns = [
    { header: "Nombre", key: "name", width: 18 },
    { header: "Apellidos", key: "surname", width: 22 },
    { header: "Teléfono", key: "phone", width: 16 },
    { header: "Puesto", key: "role", width: 22 },
    { header: "Email", key: "email", width: 26 },
    { header: "Zona", key: "zone", width: 18 },
    { header: "Valoración", key: "rating", width: 11 },
    { header: "Notas", key: "notes", width: 30 },
  ];
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF5B3FD6" } };
  ws.getColumn("phone").numFmt = "@"; // texto: conserva ceros y prefijos
  ws.addRow({ name: "Lucía", surname: "Martín Pérez", phone: "600 123 456", role: "Camarero", email: "lucia@ejemplo.com", zone: "Valencia", rating: 4, notes: "Tiene coche" });
  ws.addRow({ name: "Iván", surname: "Serrano", phone: "+34 611 222 333", role: "Mozo", zone: "Alicante", rating: 3 });
  ws.addRow({ name: "Rosa", surname: "Blanco", phone: "622333444", role: "Maître", rating: 5 });
  for (let r = 2; r <= 500; r++) {
    ws.getCell(`D${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Camarero,Camarero responsable,Maître,Mozo"'],
      showErrorMessage: true,
      error: "Elige Camarero, Camarero responsable, Maître o Mozo",
    };
  }
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const help = wb.addWorksheet("Instrucciones");
  help.getColumn(1).width = 100;
  [
    "Cómo rellenar la plantilla",
    "",
    "• Una fila por trabajador. Obligatorios: Nombre, Teléfono y Puesto.",
    "• Puesto: Camarero, Camarero responsable, Maître o Mozo (también se entienden «camarera», «metre», «mozo de descarga»…). Si alguien puede hacer varios puestos, márcalos después en su ficha.",
    "• Teléfono: con o sin +34 y espacios. Es lo que identifica a cada trabajador: si ya existe, no se duplica.",
    "• Valoración: de 1 a 5 (opcional; por defecto 3).",
    "• Se pueden añadir más columnas: las que no se reconozcan se ignoran.",
    "• Después de importar, descarga desde Personal el Excel con los códigos de acceso a la app.",
  ].forEach((line, i) => {
    help.getCell(`A${i + 1}`).value = line;
    if (i === 0) help.getCell("A1").font = { bold: true, size: 14 };
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: { "Content-Type": XLSX, "Content-Disposition": 'attachment; filename="plantilla_personal_artigot.xlsx"' },
  });
}
