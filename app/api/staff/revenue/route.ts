import { businessDate } from "@/lib/businessTime";
import { requireStaffFeature, staffAccessFail } from "@/lib/staffAccessServer";

function nextMonthStart(month: string) {
  const [yearText, monthText] = month.split("-");
  let year = Number(yearText);
  let monthNumber = Number(monthText) + 1;

  if (monthNumber === 13) {
    year += 1;
    monthNumber = 1;
  }

  return `${year}-${String(monthNumber).padStart(2, "0")}-01`;
}

export async function GET(request: Request) {
  try {
    const { admin } = await requireStaffFeature(request, "revenue");
    const url = new URL(request.url);
    const requestedMonth = url.searchParams.get("month");
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth || "")
      ? requestedMonth!
      : businessDate().slice(0, 7);
    const monthStart = `${month}-01`;
    const nextMonth = nextMonthStart(month);

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
        month,
        totals: { income, expense, net: income - expense },
        transactions: rows,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return staffAccessFail(error);
  }
}
