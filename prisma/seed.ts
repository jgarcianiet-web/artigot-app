import { randomInt } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const accessCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

function addDays(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  // Tarifas por defecto (editables en /admin/tarifas)
  const rates = [
    { role: "CAMARERO", hourlyRate: 12, minHours: 4 },
    { role: "MAITRE", hourlyRate: 16, minHours: 5 },
    { role: "MOZO", hourlyRate: 11, minHours: 3 },
  ];
  for (const r of rates) await db.rate.upsert({ where: { role: r.role }, create: r, update: {} });

  if ((await db.worker.count()) > 0 || process.argv.includes("--no-demo")) {
    console.log("Tarifas listas. Ya hay trabajadores: no se cargan datos de ejemplo.");
    return;
  }

  const names = {
    CAMARERO: ["Lucía Martín", "Carlos Ruiz", "Marta Gómez", "Javier López", "Elena Sánchez", "Pablo Díaz", "Sara Romero", "Adrián Navarro", "Irene Torres", "Hugo Molina", "Nerea Castro", "Diego Ortega"],
    MAITRE: ["Rosa Blanco", "Andrés Vidal", "Patricia León"],
    MOZO: ["Iván Serrano", "Raúl Prieto", "Óscar Méndez", "Jorge Cano", "Álex Rubio", "Mario Gil"],
  };
  let phone = 600100100;
  for (const [role, list] of Object.entries(names)) {
    for (const [i, name] of list.entries()) {
      await db.worker.create({
        data: {
          name,
          role,
          phone: String(phone),
          phoneKey: String(phone++),
          accessCode: accessCode(),
          rating: 5 - (i % 3),
          zone: i % 2 ? "Valencia" : "Alicante",
        },
      });
    }
  }

  await db.event.create({
    data: {
      name: "Boda Laura y Pablo", type: "BODA", date: addDays(10), startTime: "18:00", endTime: "02:00", unloadTime: "12:00",
      venue: "Finca El Olivar", lat: 39.5147, lng: -0.4253, client: "Laura García", notes: "Uniforme negro. Parking en la entrada lateral.",
      needCamareros: 8, needMaitres: 1, needMozos: 4,
    },
  });
  await db.event.create({
    data: {
      name: "Cena de empresa Levante", type: "EVENTO", date: addDays(4), startTime: "20:30", endTime: "00:30",
      venue: "Hotel Mediterráneo", lat: 39.4699, lng: -0.3763, needCamareros: 5, needMaitres: 1, needMozos: 2, unloadTime: "17:00",
    },
  });
  console.log("Datos de ejemplo cargados.");
}

main().finally(() => db.$disconnect());
