/**
 * Shared state shape for the manual inquiry form.
 *
 * This lives outside actions.ts because a "use server" module may only export
 * async functions. Exporting the initial-state object from there fails at
 * module evaluation with:
 *   A "use server" file can only export async functions, found object.
 */
export type CreateInquiryState = {
  error: string | null;
  /** Field to highlight when the failure is specific to one input. */
  field: string | null;
};

export const initialCreateInquiryState: CreateInquiryState = {
  error: null,
  field: null,
};