import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";

/** The current session, or null. Server components and route handlers only. */
export async function getSession() {
  return getAuth().api.getSession({ headers: await headers() });
}

/** The current session, or a redirect to sign in. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}
