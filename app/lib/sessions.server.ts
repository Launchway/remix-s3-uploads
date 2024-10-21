import { createCookieSessionStorage } from "@remix-run/node";

// Increase the maxAge to ensure the session persists longer
const maxAge = 60 * 60 * 24 * 30; // 30 days

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "__session",
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax",
    secrets: [process.env.SESSION_SECRET || "s3cr3t"],
    secure: process.env.NODE_ENV === "production",
  },
});

export async function getSession(request: Request) {
  const cookie = request.headers.get("Cookie");
  return sessionStorage.getSession(cookie);
}

/* eslint-disable-next-line */
export async function commitSession(session: any) {
  return sessionStorage.commitSession(session, {
    maxAge: maxAge,
  });
}
