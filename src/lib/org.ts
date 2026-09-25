import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolves the signed-in user and their organization. Every dashboard page
 * and server action needs this, since all data is scoped by org_id.
 */
export async function requireOrgContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    throw new Error("No organization found for this account.");
  }

  return { supabase, user, orgId: profile.org_id as string };
}
