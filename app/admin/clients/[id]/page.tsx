"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { getCurrentUserRole } from "../../../../lib/checkUserRole";

type ClientDetail = {
  id: string;
  client_code: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  qr_token: string | null;
  activation_code: string | null;
  status: string | null;
  client_note: string | null;
  client_source: string | null;
  client_source_other: string | null;
  created_at: string | null;
};

type SessionPackage = {
  id: string;
  client_id: string;
  total_sessions: number | null;
  used_sessions: number | null;
  remaining_sessions: number | null;
  status: string | null;
  starts_at: string | null;
  expires_at: string | null;
  package_name: string | null;
  package_value: number | null;
  created_at: string | null;
};

type ClientPurchase = {
  id: string;
  client_id: string;
  plan_name: string | null;
  session_count: number | null;
  price: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  debt_deadline: string | null;
  purchase_type: string | null;
  status: string | null;
  created_at: string | null;
};

type SessionHistory = {
  id: string;
  trainer_id: string | null;
  status: string;
  message: string | null;
  trainer_note: string | null;
  remaining_after: number | null;
  created_at: string | null;
  trainer_name: string;
};

type TrainerProfile = {
  id: string;
  full_name: string | null;
};

const CLIENT_SOURCE_OPTIONS = [
  { value: "", label: "Select source" },
  { value: "coach", label: "Coach" },
  { value: "google", label: "Google" },
  { value: "facebook", label: "Facebook" },
  { value: "instagram", label: "Instagram" },
  { value: "direct_lead_walk_in", label: "Direct Lead (Walk In)" },
  { value: "referral_lead", label: "Referral Lead" },
  { value: "other", label: "Other" },
];

function generateActivationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateInput(value: string | null) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  return `$${Number(value).toLocaleString("en-CA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function getStatusClass(status: string | null) {
  if (status === "active" || status === "paid" || status === "success") {
    return "bg-green-500/20 text-green-300";
  }

  if (status === "inactive" || status === "failed" || status === "cancelled") {
    return "bg-red-500/20 text-red-300";
  }

  return "bg-gray-500/20 text-gray-300";
}

function getPurchaseTypeLabel(value: string | null) {
  if (value === "new") return "New";
  if (value === "renew") return "Renew";
  return "-";
}

function getDaysUntil(value: string | null) {
  if (!value) return null;

  const today = new Date();
  const deadline = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(deadline.getTime())) return null;

  today.setHours(0, 0, 0, 0);

  return Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
}

function getDebtNotice(
  balanceDue: number | null | undefined,
  deadline: string | null
) {
  const cleanBalance = Number(balanceDue || 0);

  if (cleanBalance <= 0) {
    return {
      label: "No active debt",
      className: "border-green-400/30 bg-green-400/10 text-green-300",
    };
  }

  if (!deadline) {
    return {
      label: "Debt has no deadline",
      className: "border-orange-400/30 bg-orange-400/10 text-orange-300",
    };
  }

  const daysLeft = getDaysUntil(deadline);

  if (daysLeft === null) {
    return {
      label: "Invalid debt deadline",
      className: "border-red-400/30 bg-red-400/10 text-red-300",
    };
  }

  if (daysLeft < 0) {
    return {
      label: `Overdue by ${Math.abs(daysLeft)} day${
        Math.abs(daysLeft) === 1 ? "" : "s"
      }`,
      className: "border-red-400/30 bg-red-400/10 text-red-300",
    };
  }

  if (daysLeft === 0) {
    return {
      label: "Debt is due today",
      className: "border-red-400/30 bg-red-400/10 text-red-300",
    };
  }

  if (daysLeft <= 7) {
    return {
      label: `Debt due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
      className: "border-orange-400/30 bg-orange-400/10 text-orange-300",
    };
  }

  return {
    label: `Debt due in ${daysLeft} days`,
    className: "border-yellow-400/30 bg-yellow-400/10 text-yellow-300",
  };
}

export default function AdminClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [packages, setPackages] = useState<SessionPackage[]>([]);
  const [purchases, setPurchases] = useState<ClientPurchase[]>([]);
  const [sessionHistory, setSessionHistory] = useState<SessionHistory[]>([]);
  const [qrCode, setQrCode] = useState("");

  const [checkingRole, setCheckingRole] = useState(true);
  const [checkingMessage, setCheckingMessage] = useState(
    "Checking admin access..."
  );
  const [loading, setLoading] = useState(true);

  const [editClientCode, setEditClientCode] = useState("");
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editDateOfBirth, setEditDateOfBirth] = useState("");
  const [editClientSource, setEditClientSource] = useState("");
  const [editClientSourceOther, setEditClientSourceOther] = useState("");
  const [editClientNote, setEditClientNote] = useState("");
  const [savingClientInfo, setSavingClientInfo] = useState(false);

  const [activationCode, setActivationCode] = useState("");
  const [generatingActivationCode, setGeneratingActivationCode] =
    useState(false);

  const [packageName, setPackageName] = useState("");
  const [packageValue, setPackageValue] = useState("");
  const [packageStartDate, setPackageStartDate] = useState("");
  const [packageExpireDate, setPackageExpireDate] = useState("");
  const [purchaseType, setPurchaseType] = useState("");
  const [savingPackage, setSavingPackage] = useState(false);

  const [debtAmount, setDebtAmount] = useState("");
  const [debtDeadline, setDebtDeadline] = useState("");
  const [savingDebt, setSavingDebt] = useState(false);

  async function fetchSessionHistory() {
    const { data: historyData, error: historyError } = await supabase
      .from("session_history")
      .select(
        "id, trainer_id, status, message, trainer_note, remaining_after, created_at"
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (historyError) {
      console.error(historyError.message);
      setSessionHistory([]);
      return;
    }

    const rawHistory = (historyData || []) as Omit<
      SessionHistory,
      "trainer_name"
    >[];

    const trainerIds = Array.from(
      new Set(
        rawHistory
          .map((log) => log.trainer_id)
          .filter((trainerId): trainerId is string => Boolean(trainerId))
      )
    );

    if (trainerIds.length === 0) {
      setSessionHistory(
        rawHistory.map((log) => ({
          ...log,
          trainer_name: "Admin / Manual",
        }))
      );
      return;
    }

    const { data: trainerProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", trainerIds);

    const trainerNameMap = new Map(
      ((trainerProfiles || []) as TrainerProfile[]).map((profile) => [
        profile.id,
        profile.full_name || "Unknown Trainer",
      ])
    );

    setSessionHistory(
      rawHistory.map((log) => ({
        ...log,
        trainer_name:
          log.trainer_id && trainerNameMap.get(log.trainer_id)
            ? trainerNameMap.get(log.trainer_id)!
            : "Admin / Manual",
      }))
    );
  }

  async function fetchClientDetail() {
    setLoading(true);

    const [clientResult, packageResult, purchaseResult] = await Promise.all([
      supabase
        .from("clients")
        .select(
          "id, client_code, full_name, email, phone, gender, date_of_birth, qr_token, activation_code, status, client_note, client_source, client_source_other, created_at"
        )
        .eq("id", clientId)
        .maybeSingle(),

      supabase
        .from("session_packages")
        .select(
          "id, client_id, total_sessions, used_sessions, remaining_sessions, status, starts_at, expires_at, package_name, package_value, created_at"
        )
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),

      supabase
        .from("client_purchases")
        .select(
          "id, client_id, plan_name, session_count, price, amount_paid, balance_due, debt_deadline, purchase_type, status, created_at"
        )
        .eq("client_id", clientId)
        .order("created_at", { ascending: false }),
    ]);

    if (clientResult.error) {
      alert(clientResult.error.message);
      setLoading(false);
      return;
    }

    if (!clientResult.data) {
      setClient(null);
      setLoading(false);
      return;
    }

    if (packageResult.error) {
      alert(packageResult.error.message);
      setLoading(false);
      return;
    }

    if (purchaseResult.error) {
      alert(purchaseResult.error.message);
      setLoading(false);
      return;
    }

    const cleanClient = clientResult.data as ClientDetail;
    const cleanPackages = (packageResult.data || []) as SessionPackage[];
    const cleanPurchases = (purchaseResult.data || []) as ClientPurchase[];

    const activePackage = cleanPackages[0] || null;
    const latestPurchase = cleanPurchases[0] || null;
    const debtPurchase =
      cleanPurchases.find((purchase) => Number(purchase.balance_due || 0) > 0) ||
      latestPurchase;

    setClient(cleanClient);
    setPackages(cleanPackages);
    setPurchases(cleanPurchases);

    setEditClientCode(cleanClient.client_code || "");
    setEditName(cleanClient.full_name || "");
    setEditEmail(cleanClient.email || "");
    setEditPhone(cleanClient.phone || "");
    setEditGender(cleanClient.gender || "");
    setEditDateOfBirth(formatDateInput(cleanClient.date_of_birth));
    setEditClientSource(cleanClient.client_source || "");
    setEditClientSourceOther(cleanClient.client_source_other || "");
    setEditClientNote(cleanClient.client_note || "");
    setActivationCode(cleanClient.activation_code || "");

    setPackageName(activePackage?.package_name || latestPurchase?.plan_name || "");
    setPackageValue(
      activePackage?.package_value !== null &&
        activePackage?.package_value !== undefined
        ? String(activePackage.package_value)
        : latestPurchase?.price !== null && latestPurchase?.price !== undefined
        ? String(latestPurchase.price)
        : ""
    );
    setPackageStartDate(formatDateInput(activePackage?.starts_at || null));
    setPackageExpireDate(formatDateInput(activePackage?.expires_at || null));
    setPurchaseType(latestPurchase?.purchase_type || "");

    setDebtAmount(
      debtPurchase?.balance_due !== null && debtPurchase?.balance_due !== undefined
        ? String(debtPurchase.balance_due)
        : ""
    );
    setDebtDeadline(formatDateInput(debtPurchase?.debt_deadline || null));

    if (cleanClient.qr_token) {
      const qrImage = await QRCode.toDataURL(cleanClient.qr_token);
      setQrCode(qrImage);
    } else {
      setQrCode("");
    }

    await fetchSessionHistory();

    setLoading(false);
  }

  async function generateClientActivationCode() {
    if (!client) return;

    if (!client.email) {
      alert("Please save a client email before generating an activation code.");
      return;
    }

    const nextCode = generateActivationCode();

    setGeneratingActivationCode(true);

    const { error } = await supabase
      .from("clients")
      .update({
        activation_code: nextCode,
      })
      .eq("id", client.id);

    if (error) {
      alert(error.message);
      setGeneratingActivationCode(false);
      return;
    }

    setActivationCode(nextCode);
    setClient({
      ...client,
      activation_code: nextCode,
    });

    setGeneratingActivationCode(false);
    alert(`Activation code generated: ${nextCode}`);
  }

  async function saveClientInfo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!client) return;

    if (!editName.trim()) {
      alert("Client name is required.");
      return;
    }

    if (editClientSource === "other" && !editClientSourceOther.trim()) {
      alert("Please specify the other client source.");
      return;
    }

    setSavingClientInfo(true);

    const { error } = await supabase
      .from("clients")
      .update({
        client_code: editClientCode.trim() || null,
        full_name: editName.trim(),
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
        gender: editGender.trim() || null,
        date_of_birth: editDateOfBirth || null,
        client_source: editClientSource || null,
        client_source_other:
          editClientSource === "other"
            ? editClientSourceOther.trim() || null
            : null,
        client_note: editClientNote.trim() || null,
      })
      .eq("id", client.id);

    if (error) {
      alert(error.message);
      setSavingClientInfo(false);
      return;
    }

    alert("Client information saved.");
    await fetchClientDetail();
    setSavingClientInfo(false);
  }

  async function savePackageDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!client) return;

    const activePackage = packages[0] || null;
    const latestPurchase = purchases[0] || null;

    const numericPackageValue = packageValue.trim() ? Number(packageValue) : null;

    if (
      numericPackageValue !== null &&
      (Number.isNaN(numericPackageValue) || numericPackageValue < 0)
    ) {
      alert("Package value must be a valid number.");
      return;
    }

    setSavingPackage(true);

    if (activePackage) {
      const { error: packageError } = await supabase
        .from("session_packages")
        .update({
          package_name: packageName.trim() || null,
          package_value: numericPackageValue,
          starts_at: packageStartDate
            ? new Date(`${packageStartDate}T00:00:00`).toISOString()
            : null,
          expires_at: packageExpireDate
            ? new Date(`${packageExpireDate}T23:59:59`).toISOString()
            : null,
        })
        .eq("id", activePackage.id);

      if (packageError) {
        alert(packageError.message);
        setSavingPackage(false);
        return;
      }
    }

    if (latestPurchase) {
      const { error: purchaseError } = await supabase
        .from("client_purchases")
        .update({
          plan_name: packageName.trim() || null,
          price: numericPackageValue,
          purchase_type: purchaseType || null,
        })
        .eq("id", latestPurchase.id);

      if (purchaseError) {
        alert(purchaseError.message);
        setSavingPackage(false);
        return;
      }
    } else {
      const { error: insertPurchaseError } = await supabase
        .from("client_purchases")
        .insert({
          client_id: client.id,
          plan_name: packageName.trim() || null,
          price: numericPackageValue,
          purchase_type: purchaseType || null,
          status: "paid",
          created_at: new Date().toISOString(),
        });

      if (insertPurchaseError) {
        alert(insertPurchaseError.message);
        setSavingPackage(false);
        return;
      }
    }

    alert("Package details saved.");
    await fetchClientDetail();
    setSavingPackage(false);
  }

  async function saveDebtDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!client) return;

    const latestPurchase = purchases[0] || null;
    const numericDebtAmount = debtAmount.trim() ? Number(debtAmount) : 0;

    if (Number.isNaN(numericDebtAmount) || numericDebtAmount < 0) {
      alert("Debt must be a valid number.");
      return;
    }

    if (numericDebtAmount > 0 && !debtDeadline) {
      alert("Please add a deadline for this debt.");
      return;
    }

    setSavingDebt(true);

    if (latestPurchase) {
      const { error } = await supabase
        .from("client_purchases")
        .update({
          balance_due: numericDebtAmount,
          debt_deadline: numericDebtAmount > 0 ? debtDeadline : null,
          status: "paid",
        })
        .eq("id", latestPurchase.id);

      if (error) {
        alert(error.message);
        setSavingDebt(false);
        return;
      }
    } else {
      const { error } = await supabase.from("client_purchases").insert({
        client_id: client.id,
        plan_name: packageName.trim() || "Manual Debt",
        price: numericDebtAmount,
        amount_paid: 0,
        balance_due: numericDebtAmount,
        debt_deadline: numericDebtAmount > 0 ? debtDeadline : null,
        purchase_type: purchaseType || null,
        status: "paid",
        created_at: new Date().toISOString(),
      });

      if (error) {
        alert(error.message);
        setSavingDebt(false);
        return;
      }
    }

    alert("Debt details saved.");
    await fetchClientDetail();
    setSavingDebt(false);
  }

  async function toggleClientStatus() {
    if (!client) return;

    const newStatus = client.status === "active" ? "inactive" : "active";

    const { error } = await supabase
      .from("clients")
      .update({
        status: newStatus,
      })
      .eq("id", client.id);

    if (error) {
      alert(error.message);
      return;
    }

    alert(`Client is now ${newStatus}.`);
    await fetchClientDetail();
  }

  useEffect(() => {
    async function protectPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        setCheckingMessage("Redirecting to login...");
        router.push("/login");
        return;
      }

      if (role !== "admin") {
        if (role === "trainer" || role === "nutrition_coach") {
          router.push(`/trainer/clients/${clientId}`);
          return;
        }

        if (role === "client") {
          router.push("/client");
          return;
        }

        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      setCheckingRole(false);
      await fetchClientDetail();
    }

    protectPage();
  }, [router, clientId]);

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="text-sm font-semibold text-yellow-400">
            {checkingMessage}
          </p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="text-sm font-semibold text-yellow-400">
            Loading client...
          </p>
        </div>
      </main>
    );
  }

  if (!client) {
    return (
      <main className="min-h-screen bg-black p-6 text-white">
        <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="text-sm font-semibold text-yellow-400">
            Client not found.
          </p>

          <Link
            href="/admin/clients"
            className="mt-5 inline-block rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold uppercase text-black"
          >
            Back to Clients
          </Link>
        </div>
      </main>
    );
  }

  const activePackage = packages[0] || null;
  const latestPurchase = purchases[0] || null;
  const debtPurchase =
    purchases.find((purchase) => Number(purchase.balance_due || 0) > 0) ||
    latestPurchase;
  const debtNotice = getDebtNotice(
    debtPurchase?.balance_due,
    debtPurchase?.debt_deadline || null
  );

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          <header className="mb-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.45em] text-yellow-400">
                FXA FITNESS
              </p>

              <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
                Client Detail
              </h1>

              <p className="mt-3 text-sm font-normal text-gray-400 md:text-base">
                Edit client profile, first-time activation code, package details,
                payment debt, and deadline.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={toggleClientStatus}
                className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
              >
                {client.status === "active" ? "Deactivate" : "Reactivate"}
              </button>

              <Link
                href="/admin/clients"
                className="rounded-2xl bg-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-yellow-300"
              >
                Back
              </Link>
            </div>
          </header>

          <section className="mb-6 rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Client
                </p>

                <h2 className="mt-2 text-4xl font-semibold text-yellow-400">
                  {client.full_name}
                </h2>

                <p className="mt-2 text-sm font-normal text-gray-400">
                  Client Code:{" "}
                  <span className="text-white">
                    {client.client_code || "-"}
                  </span>
                </p>
              </div>

              <div className="flex flex-col items-start gap-2 md:items-end">
                <span
                  className={`w-fit rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide ${getStatusClass(
                    client.status
                  )}`}
                >
                  {client.status || "-"}
                </span>

                <span
                  className={`w-fit rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide ${debtNotice.className}`}
                >
                  {debtNotice.label}
                </span>
              </div>
            </div>
          </section>

          <section className="mb-6 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <form
              onSubmit={saveClientInfo}
              className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur"
            >
              <h2 className="text-2xl font-semibold">Edit Client Info</h2>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Client Code
                  </span>
                  <input
                    value={editClientCode}
                    onChange={(event) => setEditClientCode(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Full Name
                  </span>
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                    required
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Email
                  </span>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(event) => setEditEmail(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Phone
                  </span>
                  <input
                    value={editPhone}
                    onChange={(event) => setEditPhone(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Gender
                  </span>
                  <input
                    value={editGender}
                    onChange={(event) => setEditGender(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Date of Birth
                  </span>
                  <input
                    type="date"
                    value={editDateOfBirth}
                    onChange={(event) => setEditDateOfBirth(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Client Source
                  </span>
                  <select
                    value={editClientSource}
                    onChange={(event) => setEditClientSource(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-white px-4 py-3 text-sm font-normal text-black outline-none focus:border-yellow-400"
                  >
                    {CLIENT_SOURCE_OPTIONS.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                        className="bg-white text-black"
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {editClientSource === "other" ? (
                  <label>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                      Other Source
                    </span>
                    <input
                      value={editClientSourceOther}
                      onChange={(event) =>
                        setEditClientSourceOther(event.target.value)
                      }
                      className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                    />
                  </label>
                ) : null}
              </div>

              <label className="mt-5 block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Client Note
                </span>
                <textarea
                  value={editClientNote}
                  onChange={(event) => setEditClientNote(event.target.value)}
                  className="min-h-32 w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal leading-6 text-white outline-none focus:border-yellow-400"
                />
              </label>

              <button
                type="submit"
                disabled={savingClientInfo}
                className="mt-5 rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-yellow-300 disabled:opacity-60"
              >
                {savingClientInfo ? "Saving..." : "Save Client Info"}
              </button>
            </form>

            <section className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 text-center shadow-2xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                QR Access
              </p>

              <h2 className="mt-2 text-2xl font-semibold text-white">
                Client QR Code
              </h2>

              <div className="mt-5 inline-block rounded-2xl bg-white p-4">
                {qrCode ? (
                  <img
                    src={qrCode}
                    alt="Client QR Code"
                    className="h-56 w-56 rounded-xl"
                  />
                ) : (
                  <div className="flex h-56 w-56 items-center justify-center rounded-xl bg-gray-100 text-sm text-gray-500">
                    No QR token
                  </div>
                )}
              </div>
            </section>
          </section>

          <section className="mb-6 rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                  First-Time Setup
                </p>

                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Client Activation Code
                </h2>

                <p className="mt-2 text-sm font-normal text-gray-400">
                  Give this code to the client. They use it on the Activate Client
                  Account page with their email and new password.
                </p>

                <div className="mt-4 rounded-2xl border border-white/10 bg-black/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Client Email
                  </p>
                  <p className="mt-1 text-sm font-normal text-white">
                    {client.email || "No email saved"}
                  </p>
                </div>
              </div>

              <div className="w-full rounded-2xl border border-yellow-400/30 bg-black/60 p-5 lg:w-96">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Current Code
                </p>

                <p className="mt-3 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-4 py-4 text-center text-4xl font-semibold tracking-[0.22em] text-yellow-300">
                  {activationCode || "------"}
                </p>

                <button
                  type="button"
                  onClick={generateClientActivationCode}
                  disabled={generatingActivationCode || !client.email}
                  className="mt-4 w-full rounded-xl bg-yellow-400 px-4 py-3 text-sm font-semibold uppercase text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {generatingActivationCode
                    ? "Generating..."
                    : activationCode
                    ? "Generate New Code"
                    : "Generate First-Time Code"}
                </button>

                {!client.email ? (
                  <p className="mt-3 text-xs font-normal text-red-300">
                    Save a client email first before generating an activation code.
                  </p>
                ) : (
                  <p className="mt-3 text-xs font-normal text-gray-400">
                    Admin and staff can use this code for first-time account setup.
                  </p>
                )}

                <Link
                  href="/client/activate"
                  className="mt-3 block text-center text-xs font-semibold uppercase text-yellow-400 hover:text-yellow-300"
                >
                  Open Activate Page
                </Link>
              </div>
            </div>
          </section>

          <section className="mb-6 grid gap-4 md:grid-cols-4">
            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-2xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Total Sessions
              </p>
              <p className="mt-3 text-4xl font-semibold text-yellow-400">
                {activePackage?.total_sessions ?? 0}
              </p>
            </div>

            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-2xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Used Sessions
              </p>
              <p className="mt-3 text-4xl font-semibold text-yellow-400">
                {activePackage?.used_sessions ?? 0}
              </p>
            </div>

            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-2xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Remaining
              </p>
              <p className="mt-3 text-4xl font-semibold text-yellow-400">
                {activePackage?.remaining_sessions ?? 0}
              </p>
            </div>

            <div className="rounded-[2rem] border border-red-500/30 bg-red-500/10 p-5 text-center shadow-2xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-300">
                Current Debt
              </p>
              <p className="mt-3 text-4xl font-semibold text-red-300">
                {formatMoney(debtPurchase?.balance_due)}
              </p>
            </div>
          </section>

          <section className="mb-6 rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur">
            <h2 className="text-2xl font-semibold">Package Details</h2>

            <form onSubmit={savePackageDetails} className="mt-5">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Package Name
                  </span>
                  <input
                    value={packageName}
                    onChange={(event) => setPackageName(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                    placeholder="Example: 10 Session Package"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-yellow-300">
                    New / Renew
                  </span>
                  <select
                    value={purchaseType}
                    onChange={(event) => setPurchaseType(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-400 bg-white px-4 py-3 text-sm font-normal text-black outline-none focus:border-yellow-300"
                  >
                    <option value="" className="bg-white text-black">
                      Select New or Renew
                    </option>
                    <option value="new" className="bg-white text-black">
                      New
                    </option>
                    <option value="renew" className="bg-white text-black">
                      Renew
                    </option>
                  </select>

                  <p className="mt-2 text-xs font-normal text-yellow-300">
                    Current: {getPurchaseTypeLabel(purchaseType || null)}
                  </p>
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Package Value
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={packageValue}
                    onChange={(event) => setPackageValue(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Start Date
                  </span>
                  <input
                    type="date"
                    value={packageStartDate}
                    onChange={(event) => setPackageStartDate(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Expire Date
                  </span>
                  <input
                    type="date"
                    value={packageExpireDate}
                    onChange={(event) => setPackageExpireDate(event.target.value)}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={savingPackage}
                className="mt-5 rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-yellow-300 disabled:opacity-60"
              >
                {savingPackage ? "Saving..." : "Save Package Details"}
              </button>
            </form>
          </section>

          <section className="mb-6 rounded-[2rem] border border-red-500/30 bg-red-500/10 p-6 shadow-2xl backdrop-blur">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-white">
                  Debt and Deadline
                </h2>

                <p className="mt-2 text-sm font-normal text-gray-300">
                  Admin-only payment tracking. Staff pages should not show this
                  financial information.
                </p>
              </div>

              <span
                className={`w-fit rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide ${debtNotice.className}`}
              >
                {debtNotice.label}
              </span>
            </div>

            <form onSubmit={saveDebtDetails} className="mt-5">
              <div className="grid gap-4 md:grid-cols-3">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-300">
                    Debt Amount
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={debtAmount}
                    onChange={(event) => setDebtAmount(event.target.value)}
                    placeholder="0"
                    className="w-full rounded-2xl border border-red-400/40 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-300">
                    Debt Deadline
                  </span>
                  <input
                    type="date"
                    value={debtDeadline}
                    onChange={(event) => setDebtDeadline(event.target.value)}
                    className="w-full rounded-2xl border border-red-400/40 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <div className="rounded-2xl border border-red-400/30 bg-black/40 p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-300">
                    Current Deadline
                  </p>
                  <p className="mt-2 text-sm font-normal text-white">
                    {formatDate(debtPurchase?.debt_deadline || null)}
                  </p>
                  <p className="mt-2 text-xs font-normal text-gray-400">
                    Notice appears when deadline is within 7 days or overdue.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingDebt}
                className="mt-5 rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-yellow-300 disabled:opacity-60"
              >
                {savingDebt ? "Saving..." : "Save Debt"}
              </button>
            </form>
          </section>

          <section className="mb-6 rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur">
            <h2 className="text-2xl font-semibold">Latest Purchase</h2>

            <div className="mt-5 grid gap-3 md:grid-cols-6">
              <div className="rounded-2xl bg-black/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Purchase Date
                </p>
                <p className="mt-2 font-normal text-white">
                  {formatDate(latestPurchase?.created_at || null)}
                </p>
              </div>

              <div className="rounded-2xl bg-black/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  New / Renew
                </p>
                <p className="mt-2 font-normal text-yellow-300">
                  {getPurchaseTypeLabel(latestPurchase?.purchase_type || null)}
                </p>
              </div>

              <div className="rounded-2xl bg-black/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Price
                </p>
                <p className="mt-2 font-normal text-green-300">
                  {formatMoney(latestPurchase?.price)}
                </p>
              </div>

              <div className="rounded-2xl bg-black/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Paid
                </p>
                <p className="mt-2 font-normal text-green-300">
                  {formatMoney(latestPurchase?.amount_paid)}
                </p>
              </div>

              <div className="rounded-2xl bg-black/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Balance Due
                </p>
                <p className="mt-2 font-normal text-red-300">
                  {formatMoney(latestPurchase?.balance_due)}
                </p>
              </div>

              <div className="rounded-2xl bg-black/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Debt Deadline
                </p>
                <p className="mt-2 font-normal text-orange-300">
                  {formatDate(latestPurchase?.debt_deadline || null)}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur">
            <h2 className="text-2xl font-semibold">Recent Sessions</h2>

            {sessionHistory.length === 0 ? (
              <p className="mt-5 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm font-normal text-gray-400">
                No session history yet.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {sessionHistory.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-2xl border border-white/10 bg-black/40 p-4"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-semibold text-yellow-400">
                          {log.status}
                        </p>

                        <p className="mt-1 text-sm font-normal text-gray-400">
                          Trainer: {log.trainer_name}
                        </p>
                      </div>

                      <p className="text-sm font-normal text-gray-400">
                        {formatDateTime(log.created_at)}
                      </p>
                    </div>

                    <p className="mt-2 text-sm font-normal text-gray-300">
                      Remaining After:{" "}
                      <span className="text-yellow-400">
                        {log.remaining_after ?? "-"}
                      </span>
                    </p>

                    {log.message ? (
                      <p className="mt-2 text-sm text-gray-400">
                        {log.message}
                      </p>
                    ) : null}

                    {log.trainer_note ? (
                      <div className="mt-3 rounded-2xl border border-yellow-400/20 bg-yellow-400/10 p-3">
                        <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                          Session Note
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-sm font-normal leading-6 text-yellow-100">
                          {log.trainer_note}
                        </p>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}