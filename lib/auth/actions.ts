"use server";

import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  createSessionToken,
} from "./session";

function passwordsMatch(input: string, expected: string) {
  // Hashing both sides gives equal-length buffers for timingSafeEqual.
  const a = createHash("sha256").update(input).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export type LoginState = { error?: string };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = formData.get("password");
  const expected = process.env.APP_PASSWORD;
  if (!expected) return { error: "APP_PASSWORD is not configured" };
  if (typeof password !== "string" || !passwordsMatch(password, expected)) {
    await new Promise((r) => setTimeout(r, 1000));
    return { error: "Incorrect password" };
  }
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(COOKIE_NAME);
  redirect("/login");
}
