import { generateAiText } from "@/lib/aiProvider";
import { aiRouteError, requireAiManager } from "@/lib/clientAiReview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Message = { role: "user" | "assistant"; content: string };

function clean(value: unknown, max = 2000) {
  return String(value || "").trim().slice(0, max);
}

export async function POST(request: Request) {
  try {
    const { admin, role } = await requireAiManager(request);
    const body = (await request.json()) as { question?: string; history?: Message[] };
    const question = clean(body.question);
    if (!question) {
      return Response.json({ success: false, error: "Please enter a question." }, { status: 400 });
    }

    const history = Array.isArray(body.history)
      ? body.history
          .filter((item) => item && (item.role === "user" || item.role === "assistant"))
          .slice(-8)
          .map((item) => `${item.role.toUpperCase()}: ${clean(item.content, 1500)}`)
          .join("\n")
      : "";

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const recentStart = new Date(now.getTime() - 90 * 86400000).toISOString();
    const demoEnd = new Date(now.getTime() + 7 * 86400000).toISOString();

    const [clientsRes, packagesRes, purchasesRes, leadsRes, sessionsRes, staffRes, financeRes] = await Promise.all([
      admin.from("clients").select("id, client_code, full_name, status, assigned_trainer_id, assigned_nutrition_coach_id").limit(1000),
      admin.from("session_packages").select("client_id, remaining_sessions, total_sessions, used_sessions, created_at").order("created_at", { ascending: false }).limit(3000),
      admin.from("client_purchases").select("client_id, plan_name, balance_due, debt_deadline, status, created_at").limit(3000),
      admin.from("leads").select("full_name, status, demo_at, assigned_trainer_id, source_type, source_detail").gte("demo_at", now.toISOString()).lte("demo_at", demoEnd).limit(200),
      admin.from("session_history").select("trainer_id, client_id, session_type, status, created_at").gte("created_at", recentStart).limit(5000),
      admin.from("profiles").select("id, full_name, email, role").in("role", ["trainer", "nutrition_coach"]).limit(500),
      admin.from("business_transactions").select("transaction_type, amount, transaction_date").gte("transaction_date", monthStart.slice(0, 10)).limit(2000),
    ]);

    const firstError = [clientsRes.error, packagesRes.error, purchasesRes.error, leadsRes.error, sessionsRes.error, staffRes.error, financeRes.error].find(Boolean);
    if (firstError) throw firstError;

    const clients = clientsRes.data || [];
    const packages = packagesRes.data || [];
    const purchases = purchasesRes.data || [];
    const leads = leadsRes.data || [];
    const sessions = sessionsRes.data || [];
    const staff = staffRes.data || [];
    const finance = financeRes.data || [];
    const staffNames = new Map(staff.map((person) => [person.id, person.full_name || person.email || "Staff"]));

    const latestPackage = new Map<string, (typeof packages)[number]>();
    packages.forEach((row) => { if (!latestPackage.has(row.client_id)) latestPackage.set(row.client_id, row); });
    const remaining = (clientId: string) => {
      const row = latestPackage.get(clientId);
      if (!row) return null;
      if (row.remaining_sessions !== null && row.remaining_sessions !== undefined) return Number(row.remaining_sessions);
      return Math.max(Number(row.total_sessions || 0) - Number(row.used_sessions || 0), 0);
    };

    const lowSessions = clients
      .filter((client) => client.status === "active" && remaining(client.id) !== null && Number(remaining(client.id)) <= 5)
      .map((client) => ({ name: client.full_name, code: client.client_code, remaining: remaining(client.id), trainer: staffNames.get(client.assigned_trainer_id || "") || "Unassigned" }))
      .slice(0, 50);

    const overdueDebts = purchases
      .filter((row) => Number(row.balance_due || 0) > 0 && row.debt_deadline && new Date(`${String(row.debt_deadline).slice(0, 10)}T23:59:59`).getTime() < Date.now())
      .map((row) => ({ client: clients.find((c) => c.id === row.client_id)?.full_name || "Unknown", balance: Number(row.balance_due || 0), deadline: row.debt_deadline, plan: row.plan_name }))
      .slice(0, 50);

    const thisMonthSessions = sessions.filter((row) => new Date(row.created_at || 0).getTime() >= new Date(monthStart).getTime());
    const performance = staff.map((person) => ({
      name: person.full_name || person.email,
      role: person.role,
      completed: thisMonthSessions.filter((row) => row.trainer_id === person.id && ["success", "completed"].includes(String(row.status || "").toLowerCase())).length,
      noShow: thisMonthSessions.filter((row) => row.trainer_id === person.id && String(row.status || "").toLowerCase() === "no_show").length,
      nutritionFollowUps: thisMonthSessions.filter((row) => row.trainer_id === person.id && String(row.session_type || "").toLowerCase().includes("nutrition")).length,
    }));

    const income = finance.filter((row) => row.transaction_type === "income").reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const expense = finance.filter((row) => row.transaction_type === "expense").reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const snapshot = {
      generatedAt: now.toISOString(),
      role,
      totals: { clients: clients.length, activeClients: clients.filter((c) => c.status === "active").length, staff: staff.length, sessionsThisMonth: thisMonthSessions.length },
      financeThisMonth: { income, expense, net: income - expense },
      lowSessionClients: lowSessions,
      overdueDebts,
      demosNext7Days: leads,
      staffPerformanceThisMonth: performance,
    };

    const ai = await generateAiText({
      system: "You are FXA AI, a read-only business assistant for FXA FITNESS. Answer only from the supplied FXA snapshot. Never claim to have changed data. If the snapshot cannot answer a question, say what information is missing. Be concise, operational and clear. Reply in the language used by the user.",
      prompt: `Conversation history:\n${history || "None"}\n\nCurrent FXA snapshot:\n${JSON.stringify(snapshot)}\n\nUser question:\n${question}`,
      maxTokens: 900,
    });

    return Response.json({
      success: true,
      answer: ai.text,
      provider: ai.provider,
      model: ai.model,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return aiRouteError(error);
  }
}
