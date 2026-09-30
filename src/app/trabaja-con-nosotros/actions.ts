"use server";

import { applyAsCandidate, type ApplyResult } from "@/lib/candidates";

export async function apply(_prev: ApplyResult, form: FormData) {
  return applyAsCandidate(form);
}
