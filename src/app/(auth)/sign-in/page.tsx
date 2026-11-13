import { googleEnabled } from "@/lib/env";
import { AuthForm } from "../auth-form";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthForm mode="sign-in" googleEnabled={googleEnabled()} oauthError={error} />;
}
