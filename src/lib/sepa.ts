import { validIban } from "./staff";

/**
 * Remesa de transferencias SEPA en formato ISO 20022 pain.001.001.03, el que admiten los bancos
 * españoles (norma de la AEB/CECA «Órdenes en formato ISO 20022 para emisión de transferencias»).
 * Se marca como pago de nóminas (categoría SALA) y se sube en la banca online de la empresa.
 */

export type SepaPayment = { id: string; name: string; iban: string; amount: number; concept: string };
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

export function buildPain001(input: SepaInput) {
  const { debtor } = input;
  const payments = input.payments.map((p) => ({ ...p, iban: cleanIban(p.iban), c: cents(p.amount) }));
  if (!payments.length) throw new Error("No hay ningún pago en la remesa.");
  for (const p of payments) {
    if (p.c <= 0) throw new Error(`Importe no válido para ${p.name}.`);
    if (!validIban(p.iban)) throw new Error(`IBAN no válido para ${p.name}.`);
  }
  const total = payments.reduce((s, p) => s + p.c, 0);
  const created = input.createdAt.toISOString().slice(0, 19);
  const initiator = `${debtor.nif.toUpperCase()}${debtor.suffix.toUpperCase()}`;
  const name = esc(sepaText(debtor.name, 70));
  const agent = debtor.bic
    ? `<FinInstnId><BIC>${esc(debtor.bic.toUpperCase())}</BIC></FinInstnId>`
    : `<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>`;

  const tx = payments
    .map(
      (p) => `
      <CdtTrfTxInf>
        <PmtId><EndToEndId>${esc(sepaText(p.id, 35))}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${amt(p.c)}</InstdAmt></Amt>
        <Cdtr><Nm>${esc(sepaText(p.name, 70))}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${p.iban}</IBAN></Id></CdtrAcct>
        <Purp><Cd>SALA</Cd></Purp>
        <RmtInf><Ustrd>${esc(sepaText(p.concept, 140))}</Ustrd></RmtInf>
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
      <PmtInfId>${esc(sepaText(input.msgId, 35))}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${payments.length}</NbOfTxs>
      <CtrlSum>${amt(total)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl><Cd>SEPA</Cd></SvcLvl>
        <CtgyPurp><Cd>SALA</Cd></CtgyPurp>
      </PmtTpInf>
      <ReqdExctnDt>${input.execDate}</ReqdExctnDt>
      <Dbtr>
        <Nm>${name}</Nm>
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
