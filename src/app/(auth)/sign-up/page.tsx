import { googleEnabled } from "@/lib/env";
import { AuthForm } from "../auth-form";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <AuthForm mode="sign-up" googleEnabled={googleEnabled()} oauthError={error} />;
}
