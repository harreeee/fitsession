import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ClientRow = {
  id: string;
  full_name: string;
  email: string | null;
  profile_id: string | null;
  activation_code: string | null;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeCode(value: string | null | undefined) {
  return String(value || "").trim();
}

function getCreateUserErrorMessage(message: string) {
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("already") ||
    lowerMessage.includes("registered") ||
    lowerMessage.includes("exists")
  ) {
    return "This email already has an account. Please use client login or ask admin to check this client profile.";
  }

  return message;
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Missing Supabase server environment variables." },
        { status: 500 }
      );
    }

    const body = (await request.json()) as {
      email?: string;
      code?: string;
      password?: string;
    };

    const email = normalizeEmail(body.email || "");
    const code = normalizeCode(body.code);
    const password = String(body.password || "");

    if (!email) {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        { error: "Authorization code is required." },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: matchingClients, error: clientsError } = await supabaseAdmin
      .from("clients")
      .select("id, full_name, email, profile_id, activation_code")
      .ilike("email", email)
      .eq("activation_code", code)
      .order("created_at", { ascending: false })
      .limit(1);

    if (clientsError) {
      return NextResponse.json(
        { error: clientsError.message },
        { status: 500 }
      );
    }

    const cleanClient = ((matchingClients || [])[0] || null) as ClientRow | null;

    if (!cleanClient) {
      const { data: emailClients, error: emailCheckError } = await supabaseAdmin
        .from("clients")
        .select("id, email, activation_code")
        .ilike("email", email)
        .limit(5);

      if (emailCheckError) {
        return NextResponse.json(
          { error: emailCheckError.message },
          { status: 500 }
        );
      }

      if (!emailClients || emailClients.length === 0) {
        return NextResponse.json(
          { error: "No client found with this email." },
          { status: 404 }
        );
      }

      const hasAnyCode = emailClients.some((client) =>
        Boolean(client.activation_code)
      );

      if (!hasAnyCode) {
        return NextResponse.json(
          { error: "No activation code has been generated for this email yet." },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: "Authorization code is incorrect." },
        { status: 400 }
      );
    }

    let authUserId = cleanClient.profile_id;

    if (authUserId) {
      const { error: updateUserError } =
        await supabaseAdmin.auth.admin.updateUserById(authUserId, {
          password,
          email_confirm: true,
          user_metadata: {
            full_name: cleanClient.full_name,
            role: "client",
          },
        });

      if (updateUserError) {
        return NextResponse.json(
          { error: updateUserError.message },
          { status: 500 }
        );
      }
    } else {
      const { data: existingProfiles, error: existingProfilesError } =
        await supabaseAdmin
          .from("profiles")
          .select("id, email, full_name, role")
          .ilike("email", email)
          .limit(1);

      if (existingProfilesError) {
        return NextResponse.json(
          { error: existingProfilesError.message },
          { status: 500 }
        );
      }

      const existingProfile =
        ((existingProfiles || [])[0] || null) as ProfileRow | null;

      if (existingProfile) {
        authUserId = existingProfile.id;

        const { error: updateExistingUserError } =
          await supabaseAdmin.auth.admin.updateUserById(existingProfile.id, {
            password,
            email_confirm: true,
            user_metadata: {
              full_name: cleanClient.full_name,
              role: "client",
            },
          });

        if (updateExistingUserError) {
          return NextResponse.json(
            { error: updateExistingUserError.message },
            { status: 500 }
          );
        }
      } else {
        const { data: createdUser, error: createUserError } =
          await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
              full_name: cleanClient.full_name,
              role: "client",
            },
          });

        if (createUserError || !createdUser.user) {
          return NextResponse.json(
            {
              error: getCreateUserErrorMessage(
                createUserError?.message || "Could not create client account."
              ),
            },
            { status: 500 }
          );
        }

        authUserId = createdUser.user.id;
      }
    }

    if (!authUserId) {
      return NextResponse.json(
        { error: "Could not create or find the auth user." },
        { status: 500 }
      );
    }

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      {
        id: authUserId,
        email,
        full_name: cleanClient.full_name,
        role: "client",
      },
      {
        onConflict: "id",
      }
    );

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    const { error: updateClientError } = await supabaseAdmin
      .from("clients")
      .update({
        profile_id: authUserId,
        activation_code: null,
        email,
      })
      .eq("id", cleanClient.id);

    if (updateClientError) {
      return NextResponse.json(
        { error: updateClientError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Client account activated.",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected activation error.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}