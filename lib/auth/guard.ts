import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME, verifySessionToken } from "./session";

async function hasValidSession(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  return token ? verifySessionToken(token) : false;
}

/** Page-level guard: redirects to /login. Defense-in-depth behind proxy.ts. */
export async function requireSession(): Promise<void> {
  if (!(await hasValidSession())) redirect("/login");
}

/** Route-handler guard: returns false so the caller can respond with 401. */
export async function isApiAuthenticated(): Promise<boolean> {
  return hasValidSession();
}
