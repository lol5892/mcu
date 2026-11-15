export const PUBLIC_BRAND = "Кино вдвоём";
export const PRIVATE_PROJECT_REF = "bvzyiidmxlzrvhfvxdid";
export const authReady = import.meta.env.VITE_BETA_AUTH_READY === "true";
export function supportURL(value: string | undefined, approved: boolean) {
  if (!approved || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export const donationURL = supportURL(
  import.meta.env.VITE_SUPPORT_URL,
  import.meta.env.VITE_SUPPORT_APPROVED === "true",
);
