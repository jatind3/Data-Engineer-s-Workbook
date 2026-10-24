import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return respond({ error: "Supabase function environment is not configured." }, 500);
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return respond({ error: "Sign in as an administrator." }, 401);
    const token = authorization.slice("Bearer ".length);
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return respond({ error: "Your session is invalid or expired." }, 401);

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: caller, error: callerError } = await adminClient
      .from("profiles").select("id, role").eq("id", authData.user.id).maybeSingle();
    if (callerError || caller?.role !== "admin") return respond({ error: "Administrator access is required." }, 403);

    const body = await req.json();
    if (body.action === "invite") {
      const email = String(body.email || "").trim().toLowerCase();
      const fullName = String(body.full_name || "").trim().slice(0, 120);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respond({ error: "Enter a valid email address." }, 400);
      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName || email.split("@")[0] },
      });
      if (error) return respond({ error: error.message }, 400);
      return respond({ success: true, user_id: data.user?.id });
    }

    if (body.action === "remove") {
      const userId = String(body.user_id || "");
      if (!userId || userId === authData.user.id) return respond({ error: "You cannot remove your own account." }, 400);
      const { data: target, error: targetError } = await adminClient
        .from("profiles").select("id, role").eq("id", userId).maybeSingle();
      if (targetError || !target) return respond({ error: "Team member was not found." }, 404);
      if (target.role !== "member") return respond({ error: "Only member accounts can be removed here." }, 403);
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) return respond({ error: error.message }, 400);
      return respond({ success: true });
    }

    return respond({ error: "Unsupported action." }, 400);
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : "Unexpected server error." }, 500);
  }
});

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
