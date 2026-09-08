import { requireStaffFeature, staffAccessFail } from "@/lib/staffAccessServer";

export async function GET(request: Request) {
  try {
    const { admin } = await requireStaffFeature(request, "revenue");
    const url = new URL(request.url);
    const month = url.searchParams.get("month");
    const monthStart = /^\d{4}-\d{2}$/.test(month || "")
      ? `${month}-01`
      : new Date().toLocaleDateString("en-CA", {
          timeZone: "America/Toronto",
          year: "numeric",
          month: "2-digit",
        }).replace("/", "-") + "-01";

    const start = new Date(`${monthStart}T00:00:00-04:00`);
    const next = new Date(start);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const nextMonth = next.toISOString().slice(0, 10);

    const { data, error } = await admin
      .from("business_transactions")
      .select("id, transaction_type, source, title, amount, transaction_date, report_group, counterparty")
      .gte("transaction_date", monthStart)
      .lt("transaction_date", nextMonth)
      .order("transaction_date", { ascending: false })
      .limit(250);

    if (error) throw error;

    const rows = data || [];
    const income = rows
      .filter((row) => row.transaction_type === "income")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const expense = rows
      .filter((row) => row.transaction_type === "expense")
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    return Response.json(
      {
        month: monthStart.slice(0, 7),
        totals: { income, expense, net: income - expense },
        transactions: rows,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return staffAccessFail(error);
  }
}
