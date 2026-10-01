import { validIban } from "./staff";

/**
 * Remesa de transferencias SEPA en formato ISO 20022 pain.001.001.03, el que admiten los bancos
 * españoles (norma de la AEB/CECA «Órdenes en formato ISO 20022 para emisión de transferencias»).
 * Se marca como pago de nóminas (categoría SALA) y se sube en la banca online de la empresa.
 *
 * La estructura sigue la de las remesas de nóminas que la empresa ya sube a su banco: apunte por
 * transferencia (BtchBookg=false), país del ordenante y de cada beneficiario, nombres en
 * mayúsculas y referencia de cada transferencia con el DNI del trabajador.
 */

export type SepaPayment = {
  id: string;
  name: string;
  iban: string;
  amount: number;
  concept: string;
  /** Código postal y localidad del beneficiario (opcionales) */
  postalCode?: string | null;
  town?: string | null;
};
export type SepaInput = {
  msgId: string;
  createdAt: Date;
  execDate: string;
  debtor: { name: string; nif: string; suffix: string; iban: string; bic?: string };
  payments: SepaPayment[];
};

/** Juego de caracteres SEPA: letras latinas sin tildes, números y / - ? : ( ) . , ' + espacio. */
export function sepaText(s: string, max: number) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ñÑ]/g, (c) => (c === "ñ" ? "n" : "N"))
    .replace(/[ªº]/g, "")
    .replace(/&/g, "y")
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const cents = (n: number) => Math.round(n * 100);
const amt = (c: number) => (c / 100).toFixed(2);
const cleanIban = (s: string) => s.toUpperCase().replace(/\s/g, "");
/** Código postal y localidad a partir de una dirección libre («C/ Mayor 5, 28045 Madrid»). */
export function parseAddress(address: string | null | undefined) {
  const m = (address ?? "").match(/\b(\d{5})\b[\s,.-]*([^,\d(]+)?/);
  if (!m) return { postalCode: null, town: null };
  return { postalCode: m[1], town: m[2]?.trim().replace(/[.\s]+$/, "") || null };
}

const validBic = (s: string) => /^[A-Z]{6}[A-Z2-9][A-NP-Z0-9]([A-Z0-9]{3})?$/.test(s);

export function checkDebtor(d: SepaInput["debtor"]) {
  const errors: string[] = [];
  if (!sepaText(d.name, 70)) errors.push("Falta la razón social de la empresa (Ajustes → Empresa y contratos).");
  if (!/^[A-Z0-9]{9}$/.test(d.nif.toUpperCase())) errors.push("Falta el CIF de la empresa o no es correcto (Ajustes → Empresa y contratos).");
  if (!validIban(d.iban)) errors.push("Falta la cuenta (IBAN) de la empresa o no es correcta (Ajustes → Pagos y remesas).");
  if (d.bic && !validBic(d.bic.toUpperCase())) errors.push("El BIC de la empresa no es correcto.");
  if (!/^[A-Z0-9]{3}$/.test(d.suffix.toUpperCase())) errors.push("El sufijo del ordenante debe tener 3 caracteres (normalmente 000).");
  return errors;
}

/** Fecha y hora compactas (AAAAMMDDhhmmss, hora de Madrid) para las referencias. */
export function sepaStamp(d: Date) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}${p.month}${p.day}${p.hour}${p.minute}${p.second}`;
}

/** Referencia de cada transferencia: DNI + fecha y hora + número de orden (como las remesas de A3). */
export const paymentRef = (dni: string | null | undefined, stamp: string, n: number) =>
  `${(dni ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "") || "TRF"}${stamp}${String(n).padStart(9, "0")}`.slice(0, 35);

export function buildPain001(input: SepaInput) {
  const { debtor } = input;
  const payments = input.payments.map((p) => ({ ...p, iban: cleanIban(p.iban), c: cents(p.amount) }));
  if (!payments.length) throw new Error("No hay ningún pago en la remesa.");
  for (const p of payments) {
    if (p.c <= 0) throw new Error(`Importe no válido para ${p.name}.`);
    if (!validIban(p.iban)) throw new Error(`IBAN no válido para ${p.name}.`);
  }
  const total = payments.reduce((s, p) => s + p.c, 0);
  const st = sepaStamp(input.createdAt);
  const created = `${st.slice(0, 4)}-${st.slice(4, 6)}-${st.slice(6, 8)}T${st.slice(8, 10)}:${st.slice(10, 12)}:${st.slice(12, 14)}`;
  const initiator = `${debtor.nif.toUpperCase()}${debtor.suffix.toUpperCase()}`;
  const name = esc(sepaText(debtor.name, 70).toUpperCase());
  const agent = debtor.bic
    ? `<FinInstnId><BIC>${esc(debtor.bic.toUpperCase())}</BIC></FinInstnId>`
    : `<FinInstnId><PstlAdr><Ctry>ES</Ctry></PstlAdr></FinInstnId>`;
  const address = (p: SepaPayment) => {
    const pc = p.postalCode && /^\d{5}$/.test(p.postalCode) ? `<PstCd>${p.postalCode}</PstCd>` : "";
    const town = p.town ? sepaText(p.town, 35).toUpperCase() : "";
    return `<PstlAdr>${pc}${town ? `<TwnNm>${esc(town)}</TwnNm>` : ""}<Ctry>ES</Ctry></PstlAdr>`;
  };

  const tx = payments
    .map(
      (p) => `
      <CdtTrfTxInf>
        <PmtId><InstrId>${esc(sepaText(p.id, 35))}</InstrId><EndToEndId>${esc(sepaText(p.id, 35))}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${amt(p.c)}</InstdAmt></Amt>
        <Cdtr><Nm>${esc(sepaText(p.name, 70).toUpperCase())}</Nm>${address(p)}</Cdtr>
        <CdtrAcct><Id><IBAN>${p.iban}</IBAN></Id></CdtrAcct>
        <Purp><Cd>SALA</Cd></Purp>
        <RmtInf><Ustrd>${esc(sepaText(p.concept, 140).toUpperCase())}</Ustrd></RmtInf>
      </CdtTrfTxInf>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${esc(sepaText(input.msgId, 35))}</MsgId>
      <CreDtTm>${created}</CreDtTm>
      <NbOfTxs>${payments.length}</NbOfTxs>
      <CtrlSum>${amt(total)}</CtrlSum>
      <InitgPty>
        <Nm>${name}</Nm>
        <Id><OrgId><Othr><Id>${esc(initiator)}</Id></Othr></OrgId></Id>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${esc(sepaText(`${input.msgId}001`, 35))}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>false</BtchBookg>
      <NbOfTxs>${payments.length}</NbOfTxs>
      <CtrlSum>${amt(total)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
        <CtgyPurp><Cd>SALA</Cd></CtgyPurp>
      </PmtTpInf>
      <ReqdExctnDt>${input.execDate}</ReqdExctnDt>
      <Dbtr>
        <Nm>${name}</Nm>
        <PstlAdr><Ctry>ES</Ctry></PstlAdr>
        <Id><OrgId><Othr><Id>${esc(initiator)}</Id></Othr></OrgId></Id>
      </Dbtr>
      <DbtrAcct><Id><IBAN>${cleanIban(debtor.iban)}</IBAN></Id><Ccy>EUR</Ccy></DbtrAcct>
      <DbtrAgt>${agent}</DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>${tx}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}
