"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { getCurrentUserRole } from "../../../../lib/checkUserRole";

type ClientDetail = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  qr_token: string;
  status: string;
  session_packages: {
    id: string;
    total_sessions: number;
    used_sessions: number;
    remaining_sessions: number;
    status: string;
    starts_at: string | null;
    expires_at: string | null;
    sold_by: string | null;
    package_name: string | null;
    package_value: number | null;
  }[];
};

type ClientNote = {
  id: string;
  client_id: string;
  goals: string | null;
  injuries: string | null;
  trainer_notes: string | null;
  nutrition_notes: string | null;
};

type PackageRenewal = {
  id: string;
  client_id: string;
  package_id: string | null;
  added_sessions: number;
  extended_days: number;
  old_expires_at: string | null;
  new_expires_at: string | null;
  notes: string | null;
  created_at: string | null;
};

type SalesPerson = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
};

type ClientSessionHistory = {
  id: string;
  status: string;
  message: string | null;
  remaining_after: number | null;
  scanned_at: string | null;
  trainer_id: string | null;
};

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

  return `$${Number(value).toFixed(2)}`;
}

function addDaysToDate(baseDate: Date, days: number) {
  const newDate = new Date(baseDate);
  newDate.setDate(newDate.getDate() + days);
  return newDate;
}

function getSessionStatusLabel(status: string) {
  if (status === "success") return "Session Scanned";
  if (status === "manual_subtract") return "Manual Subtract";
  if (status === "no_show") return "No-Show";
  if (status === "failed") return "Failed";
  return status;
}

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clientId = params.id as string;

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [note, setNote] = useState<ClientNote | null>(null);
  const [renewals, setRenewals] = useState<PackageRenewal[]>([]);
  const [salesPeople, setSalesPeople] = useState<SalesPerson[]>([]);
  const [sessionHistory, setSessionHistory] = useState<ClientSessionHistory[]>(
    []
  );
  const [qrCode, setQrCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingRole, setCheckingRole] = useState(true);

  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingInfo, setSavingInfo] = useState(false);

  const [sessionsToAdd, setSessionsToAdd] = useState("");
  const [addingSessions, setAddingSessions] = useState(false);
  const [markingNoShow, setMarkingNoShow] = useState(false);

  const [packageName, setPackageName] = useState("");
  const [packageValue, setPackageValue] = useState("");
  const [packageStartDate, setPackageStartDate] = useState("");
  const [packageExpireDate, setPackageExpireDate] = useState("");
  const [packageSoldBy, setPackageSoldBy] = useState("");
  const [savingPackageDetails, setSavingPackageDetails] = useState(false);

  const [renewSessionsToAdd, setRenewSessionsToAdd] = useState("");
  const [renewExtendDays, setRenewExtendDays] = useState("");
  const [renewNotes, setRenewNotes] = useState("");
  const [renewingPackage, setRenewingPackage] = useState(false);

  const [goals, setGoals] = useState("");
  const [injuries, setInjuries] = useState("");
  const [trainerNotes, setTrainerNotes] = useState("");
  const [nutritionNotes, setNutritionNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const [loginCode, setLoginCode] = useState("");
  const [loginCodeEmail, setLoginCodeEmail] = useState("");
  const [generatingCode, setGeneratingCode] = useState(false);

  const [deletingClient, setDeletingClient] = useState(false);

  async function fetchClient() {
    if (!clientId) return;

    const { data, error } = await supabase
      .from("clients")
      .select(`
        id,
        full_name,
        email,
        phone,
        qr_token,
        status,
        session_packages (
          id,
          total_sessions,
          used_sessions,
          remaining_sessions,
          status,
          starts_at,
          expires_at,
          sold_by,
          package_name,
          package_value
        )
      `)
      .eq("id", clientId)
      .single();

    if (error) {
      alert(error.message);
    } else {
      setClient(data);
      setEditName(data.full_name || "");
      setEditEmail(data.email || "");
      setEditPhone(data.phone || "");

      const firstPackage = data.session_packages?.[0];

      setPackageName(firstPackage?.package_name || "");
      setPackageValue(
        firstPackage?.package_value !== null &&
          firstPackage?.package_value !== undefined
          ? String(firstPackage.package_value)
          : ""
      );
      setPackageStartDate(formatDateInput(firstPackage?.starts_at || null));
      setPackageExpireDate(formatDateInput(firstPackage?.expires_at || null));
      setPackageSoldBy(firstPackage?.sold_by || "");

      const qrImage = await QRCode.toDataURL(data.qr_token);
      setQrCode(qrImage);
    }

    setLoading(false);
  }

  async function fetchSalesPeople() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const { data: adminsData, error: adminsError } = await supabase
      .from("profiles")
      .select("id, full_name, email, role")
      .eq("role", "admin")
      .order("full_name", { ascending: true });

    if (adminsError) {
      alert(adminsError.message);
      return;
    }

    const adminPeople = ((adminsData || []) as SalesPerson[]).map((admin) => ({
      id: admin.id,
      full_name: admin.full_name,
      email: admin.email,
      role: "admin",
    }));

    let trainerPeople: SalesPerson[] = [];

    if (session?.access_token) {
      const response = await fetch("/api/admin/trainers", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      const result: {
        trainers?: {
          id: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          role: string;
        }[];
        error?: string;
      } = await response.json();

      if (response.ok) {
        trainerPeople = (result.trainers || []).map((trainer) => ({
          id: trainer.id,
          full_name: trainer.full_name,
          email: trainer.email,
          role: "trainer",
        }));
      }
    }

    const combinedPeople = [...adminPeople, ...trainerPeople];

    const uniquePeople = combinedPeople.filter(
      (person, index, array) =>
        person.id && array.findIndex((item) => item.id === person.id) === index
    );

    setSalesPeople(uniquePeople);
  }

  async function fetchClientNote() {
    if (!clientId) return;

    const { data, error } = await supabase
      .from("client_notes")
      .select("id, client_id, goals, injuries, trainer_notes, nutrition_notes")
      .eq("client_id", clientId)
      .maybeSingle();

    if (error) {
      alert(error.message);
      return;
    }

    if (data) {
      setNote(data);
      setGoals(data.goals || "");
      setInjuries(data.injuries || "");
      setTrainerNotes(data.trainer_notes || "");
      setNutritionNotes(data.nutrition_notes || "");
    } else {
      setNote(null);
      setGoals("");
      setInjuries("");
      setTrainerNotes("");
      setNutritionNotes("");
    }
  }

  async function fetchRenewals() {
    if (!clientId) return;

    const { data, error } = await supabase
      .from("package_renewals")
      .select(
        "id, client_id, package_id, added_sessions, extended_days, old_expires_at, new_expires_at, notes, created_at"
      )
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setRenewals((data || []) as PackageRenewal[]);
  }

  async function fetchSessionHistory() {
    if (!clientId) return;

    const { data, error } = await supabase
      .from("session_logs")
      .select("id, status, message, remaining_after, scanned_at, trainer_id")
      .eq("client_id", clientId)
      .order("scanned_at", { ascending: false })
      .limit(20);

    if (error) {
      alert(error.message);
      return;
    }

    setSessionHistory((data || []) as ClientSessionHistory[]);
  }

  async function updateClientInfo(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!client) return;

    if (!editName.trim()) {
      alert("Client name is required.");
      return;
    }

    setSavingInfo(true);

    const { error } = await supabase
      .from("clients")
      .update({
        full_name: editName.trim(),
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
      })
      .eq("id", client.id);

    if (error) {
      alert(error.message);
      setSavingInfo(false);
      return;
    }

    alert("Client info updated.");
    await fetchClient();
    setSavingInfo(false);
  }

  async function savePackageDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!client) return;

    const activePackage = client.session_packages?.[0];

    if (!activePackage) {
      alert("No package found.");
      return;
    }

    if (!packageStartDate) {
      alert("Start date is required.");
      return;
    }

    if (!packageExpireDate) {
      alert("Expire date is required.");
      return;
    }

    const numericPackageValue = packageValue.trim()
      ? Number(packageValue)
      : null;

    if (
      numericPackageValue !== null &&
      (Number.isNaN(numericPackageValue) || numericPackageValue < 0)
    ) {
      alert("Package value must be a valid number.");
      return;
    }

    const startDate = new Date(`${packageStartDate}T00:00:00`);
    const expireDate = new Date(`${packageExpireDate}T23:59:59`);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(expireDate.getTime())) {
      alert("Invalid package date.");
      return;
    }

    if (expireDate.getTime() < startDate.getTime()) {
      alert("Expire date cannot be before start date.");
      return;
    }

    setSavingPackageDetails(true);

    const { error } = await supabase
      .from("session_packages")
      .update({
        package_name: packageName.trim() || null,
        package_value: numericPackageValue,
        starts_at: startDate.toISOString(),
        expires_at: expireDate.toISOString(),
        sold_by: packageSoldBy || null,
      })
      .eq("id", activePackage.id);

    if (error) {
      alert(error.message);
      setSavingPackageDetails(false);
      return;
    }

    alert("Package details updated.");
    await fetchClient();
    setSavingPackageDetails(false);
  }

  async function saveClientNotes(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!client) return;

    setSavingNotes(true);

    const payload = {
      client_id: client.id,
      goals: goals.trim() || null,
      injuries: injuries.trim() || null,
      trainer_notes: trainerNotes.trim() || null,
      nutrition_notes: nutritionNotes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    if (note) {
      const { error } = await supabase
        .from("client_notes")
        .update(payload)
        .eq("id", note.id);

      if (error) {
        alert(error.message);
        setSavingNotes(false);
        return;
      }
    } else {
      const { error } = await supabase.from("client_notes").insert(payload);

      if (error) {
        alert(error.message);
        setSavingNotes(false);
        return;
      }
    }

    alert("Client notes saved.");
    await fetchClientNote();
    setSavingNotes(false);
  }

  async function addMoreSessions(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!client) return;

    const amount = Number(sessionsToAdd);

    if (Number.isNaN(amount) || amount <= 0) {
      alert("Enter a valid number of sessions.");
      return;
    }

    const activePackage = client.session_packages?.[0];

    if (!activePackage) {
      alert("No active package found.");
      return;
    }

    setAddingSessions(true);

    const { error } = await supabase
      .from("session_packages")
      .update({
        total_sessions: activePackage.total_sessions + amount,
        remaining_sessions: activePackage.remaining_sessions + amount,
      })
      .eq("id", activePackage.id);

    if (error) {
      alert(error.message);
      setAddingSessions(false);
      return;
    }

    alert("Sessions added successfully!");
    setSessionsToAdd("");
    await fetchClient();
    setAddingSessions(false);
  }

  async function renewPackage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!client) return;

    const activePackage = client.session_packages?.[0];

    if (!activePackage) {
      alert("No active package found.");
      return;
    }

    const sessionsToAdd = Number(renewSessionsToAdd || 0);
    const daysToExtend = Number(renewExtendDays || 0);

    if (
      Number.isNaN(sessionsToAdd) ||
      Number.isNaN(daysToExtend) ||
      sessionsToAdd < 0 ||
      daysToExtend < 0
    ) {
      alert("Enter valid renewal numbers.");
      return;
    }

    if (sessionsToAdd === 0 && daysToExtend === 0) {
      alert("Add sessions or extend days before renewing.");
      return;
    }

    const currentExpiresAt = activePackage.expires_at
      ? new Date(activePackage.expires_at)
      : new Date();

    const today = new Date();

    const baseDate =
      currentExpiresAt.getTime() > today.getTime() ? currentExpiresAt : today;

    const newExpiresAt =
      daysToExtend > 0 ? addDaysToDate(baseDate, daysToExtend) : currentExpiresAt;

    const confirmed = window.confirm(
      `Renew package?\n\nAdd Sessions: ${sessionsToAdd}\nExtend Days: ${daysToExtend}`
    );

    if (!confirmed) return;

    setRenewingPackage(true);

    const { error: packageError } = await supabase
      .from("session_packages")
      .update({
        total_sessions: activePackage.total_sessions + sessionsToAdd,
        remaining_sessions: activePackage.remaining_sessions + sessionsToAdd,
        expires_at: newExpiresAt.toISOString(),
        status: "active",
      })
      .eq("id", activePackage.id);

    if (packageError) {
      alert(packageError.message);
      setRenewingPackage(false);
      return;
    }

    const { data: authData } = await supabase.auth.getUser();

    const { error: renewalError } = await supabase.from("package_renewals").insert({
      client_id: client.id,
      package_id: activePackage.id,
      added_sessions: sessionsToAdd,
      extended_days: daysToExtend,
      old_expires_at: activePackage.expires_at,
      new_expires_at: newExpiresAt.toISOString(),
      notes: renewNotes.trim() || null,
      created_by: authData.user?.id || null,
    });

    if (renewalError) {
      alert("Package updated, but renewal history failed: " + renewalError.message);
      await fetchClient();
      setRenewingPackage(false);
      return;
    }

    alert("Package renewed successfully.");

    setRenewSessionsToAdd("");
    setRenewExtendDays("");
    setRenewNotes("");

    await Promise.all([fetchClient(), fetchRenewals(), fetchSessionHistory()]);
    setRenewingPackage(false);
  }

  async function markNoShow() {
    if (!client) return;

    const activePackage = client.session_packages?.[0];

    if (!activePackage) {
      alert("No active package found.");
      return;
    }

    if (activePackage.remaining_sessions <= 0) {
      alert("Client has no remaining sessions.");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure? This will deduct 1 session from this client."
    );

    if (!confirmed) return;

    setMarkingNoShow(true);

    const newUsedSessions = activePackage.used_sessions + 1;
    const newRemainingSessions = activePackage.remaining_sessions - 1;

    const { error: packageError } = await supabase
      .from("session_packages")
      .update({
        used_sessions: newUsedSessions,
        remaining_sessions: newRemainingSessions,
        status: newRemainingSessions <= 0 ? "completed" : activePackage.status,
      })
      .eq("id", activePackage.id);

    if (packageError) {
      alert(packageError.message);
      setMarkingNoShow(false);
      return;
    }

    const { error: logError } = await supabase.from("session_logs").insert({
      client_id: client.id,
      trainer_id: null,
      package_id: activePackage.id,
      status: "manual_subtract",
      message: "Session manually subtracted by admin.",
      remaining_after: newRemainingSessions,
      scanned_at: new Date().toISOString(),
    });

    if (logError) {
      alert("Session was deducted, but history log failed: " + logError.message);
      await fetchClient();
      setMarkingNoShow(false);
      return;
    }

    alert("1 session subtracted successfully.");
    await Promise.all([fetchClient(), fetchSessionHistory()]);
    setMarkingNoShow(false);
  }

  async function toggleClientStatus() {
    if (!client) return;

    const newStatus = client.status === "active" ? "inactive" : "active";

    const { error } = await supabase
      .from("clients")
      .update({ status: newStatus })
      .eq("id", client.id);

    if (error) {
      alert(error.message);
      return;
    }

    alert(`Client is now ${newStatus}.`);
    await fetchClient();
  }

  async function deleteClient() {
    if (!client) return;

    const firstConfirm = window.confirm(
      `Delete ${client.full_name}? This will remove this client from FXA FITNESS. This action cannot be undone.`
    );

    if (!firstConfirm) return;

    const typedName = window.prompt(
      `Type the client name exactly to confirm deletion:\n\n${client.full_name}`
    );

    if (typedName !== client.full_name) {
      alert("Client name did not match. Delete cancelled.");
      return;
    }

    setDeletingClient(true);

    const deleteSteps: {
      table: string;
      label: string;
    }[] = [
      { table: "session_logs", label: "session history" },
      { table: "package_renewals", label: "renewal history" },
      { table: "client_notes", label: "client notes" },
      { table: "client_login_codes", label: "client login codes" },
      { table: "client_purchases", label: "client purchases" },
      { table: "session_packages", label: "session packages" },
    ];

    for (const step of deleteSteps) {
      const { error } = await supabase
        .from(step.table)
        .delete()
        .eq("client_id", client.id);

      if (error) {
        alert(`Could not delete ${step.label}: ${error.message}`);
        setDeletingClient(false);
        return;
      }
    }

    const { error: clientError } = await supabase
      .from("clients")
      .delete()
      .eq("id", client.id);

    if (clientError) {
      alert(clientError.message);
      setDeletingClient(false);
      return;
    }

    alert("Client deleted successfully.");
    router.push("/admin/clients");
  }

  async function generateClientLoginCode() {
    if (!client) {
      alert("No client loaded.");
      return;
    }

    setGeneratingCode(true);
    setLoginCode("");
    setLoginCodeEmail("");

    try {
      const response = await fetch("/api/admin/client-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: client.id,
        }),
      });

      const result = await response.json();

      console.log("Generate code response:", result);

      setGeneratingCode(false);

      if (!response.ok) {
        alert(result.error || "Could not generate login code.");
        return;
      }

      setLoginCode(result.code);
      setLoginCodeEmail(result.email);

      alert(`Code generated: ${result.code}`);
    } catch (error) {
      console.error(error);
      setGeneratingCode(false);
      alert("Server error. Check if app/api/admin/client-code/route.ts exists.");
    }
  }

  useEffect(() => {
    async function protectClientDetailPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        router.push("/login");
        return;
      }

      if (role !== "admin") {
        if (role === "trainer") {
          router.push("/trainer/scan");
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

      await Promise.all([
        fetchClient(),
        fetchClientNote(),
        fetchRenewals(),
        fetchSalesPeople(),
        fetchSessionHistory(),
      ]);
    }

    protectClientDetailPage();
  }, [router]);

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="font-bold text-yellow-400">Checking admin access...</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <p className="text-yellow-400 font-black">Loading client...</p>
      </main>
    );
  }

  if (!client) {
    return (
      <main className="min-h-screen bg-black text-white p-6">
        <p className="text-yellow-400 font-black">Client not found.</p>
      </main>
    );
  }

  const activePackage = client.session_packages?.[0];

  const currentSalesPerson = salesPeople.find(
    (person) => person.id === activePackage?.sold_by
  );

  return (
    <main className="min-h-screen bg-black text-white p-6 print:bg-white">
      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6 print:bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8 print:hidden">
            <div>
              <h1 className="text-4xl md:text-5xl font-black text-yellow-400">
                FXA FITNESS
              </h1>

              <p className="text-gray-400 tracking-[0.25em] uppercase text-sm">
                Client Profile
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={toggleClientStatus}
                className="rounded-xl border border-yellow-400 px-5 py-3 font-black uppercase text-yellow-400 hover:bg-yellow-400 hover:text-black transition"
              >
                {client.status === "active" ? "Deactivate" : "Reactivate"}
              </button>

              <Link
                href="/admin/clients"
                className="rounded-xl bg-yellow-400 px-5 py-3 font-black uppercase text-black hover:bg-yellow-300 transition"
              >
                Back
              </Link>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 print:block">
            <section className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur print:bg-white print:border-0 print:shadow-none">
              <div className="mb-8">
                <p className="text-yellow-400 font-black uppercase tracking-widest text-sm">
                  Client
                </p>

                <h2 className="text-4xl font-black text-white print:text-black">
                  {client.full_name}
                </h2>

                <p className="mt-2 text-gray-300 print:text-black">
                  Status:{" "}
                  <span className="font-black text-yellow-400 print:text-black">
                    {client.status}
                  </span>
                </p>
              </div>

              <form onSubmit={updateClientInfo} className="print:hidden">
                <h3 className="mb-4 text-2xl font-black text-white">
                  Edit Client Info
                </h3>

                <div className="mb-4">
                  <label className="mb-2 block font-bold text-gray-200">
                    Full Name
                  </label>

                  <input
                    className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>

                <div className="mb-4">
                  <label className="mb-2 block font-bold text-gray-200">
                    Email
                  </label>

                  <input
                    className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                  />
                </div>

                <div className="mb-6">
                  <label className="mb-2 block font-bold text-gray-200">
                    Phone
                  </label>

                  <input
                    className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingInfo}
                  className="mb-8 w-full rounded-xl bg-yellow-400 p-3 font-black uppercase text-black hover:bg-yellow-300 disabled:opacity-60 transition"
                >
                  {savingInfo ? "Saving..." : "Save Client Info"}
                </button>
              </form>

              <div className="mt-8 grid grid-cols-3 gap-3 print:hidden">
                <div className="rounded-2xl border border-yellow-500/40 bg-yellow-400/10 p-5 text-center">
                  <p className="font-bold text-gray-200">Total</p>

                  <p className="text-4xl font-black text-yellow-400">
                    {activePackage?.total_sessions ?? 0}
                  </p>
                </div>

                <div className="rounded-2xl border border-yellow-500/40 bg-yellow-400/10 p-5 text-center">
                  <p className="font-bold text-gray-200">Used</p>

                  <p className="text-4xl font-black text-yellow-400">
                    {activePackage?.used_sessions ?? 0}
                  </p>
                </div>

                <div className="rounded-2xl border border-yellow-500/40 bg-yellow-400/10 p-5 text-center">
                  <p className="font-bold text-gray-200">Left</p>

                  <p className="text-4xl font-black text-yellow-400">
                    {activePackage?.remaining_sessions ?? 0}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-5 print:hidden">
                <div className="rounded-2xl border border-yellow-500/30 bg-black/40 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                    Package Name
                  </p>
                  <p className="mt-2 font-black text-yellow-400">
                    {activePackage?.package_name || "-"}
                  </p>
                </div>

                <div className="rounded-2xl border border-yellow-500/30 bg-black/40 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                    Package Value
                  </p>
                  <p className="mt-2 font-black text-green-300">
                    {formatMoney(activePackage?.package_value)}
                  </p>
                </div>

                <div className="rounded-2xl border border-yellow-500/30 bg-black/40 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                    Start Date
                  </p>
                  <p className="mt-2 font-black text-yellow-400">
                    {formatDate(activePackage?.starts_at || null)}
                  </p>
                </div>

                <div className="rounded-2xl border border-yellow-500/30 bg-black/40 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                    Expire Date
                  </p>
                  <p className="mt-2 font-black text-yellow-400">
                    {formatDate(activePackage?.expires_at || null)}
                  </p>
                </div>

                <div className="rounded-2xl border border-yellow-500/30 bg-black/40 p-4">
                  <p className="text-xs font-black uppercase tracking-widest text-gray-400">
                    Sale By
                  </p>
                  <p className="mt-2 font-black text-yellow-400">
                    {currentSalesPerson?.full_name ||
                      currentSalesPerson?.email ||
                      "-"}
                  </p>
                </div>
              </div>

              <form
                onSubmit={savePackageDetails}
                className="mt-8 rounded-2xl border border-yellow-500/30 bg-black/40 p-5 print:hidden"
              >
                <div className="mb-5">
                  <p className="text-yellow-400 font-black uppercase tracking-widest text-sm">
                    Package Details
                  </p>

                  <h3 className="text-2xl font-black text-white">
                    Package Name / Value / Dates / Sale By
                  </h3>

                  <p className="mt-2 text-sm text-gray-400">
                    Edit the package name, value, start date, expiration date,
                    and person who made the sale.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block font-black text-white">
                      Package Name
                    </label>

                    <input
                      type="text"
                      value={packageName}
                      onChange={(event) => setPackageName(event.target.value)}
                      placeholder="Example: 10 Session Package"
                      className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block font-black text-white">
                      Package Value
                    </label>

                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={packageValue}
                      onChange={(event) => setPackageValue(event.target.value)}
                      placeholder="Example: 650"
                      className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block font-black text-white">
                      Start Date
                    </label>

                    <input
                      type="date"
                      value={packageStartDate}
                      onChange={(event) => setPackageStartDate(event.target.value)}
                      className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white outline-none focus:border-yellow-400"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-2 block font-black text-white">
                      Expire Date
                    </label>

                    <input
                      type="date"
                      value={packageExpireDate}
                      onChange={(event) => setPackageExpireDate(event.target.value)}
                      className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white outline-none focus:border-yellow-400"
                      required
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block font-black text-white">
                    Person Who Made Sale
                  </label>

                  <select
                    value={packageSoldBy}
                    onChange={(event) => setPackageSoldBy(event.target.value)}
                    className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white outline-none focus:border-yellow-400"
                  >
                    <option value="">Select salesperson</option>

                    {salesPeople.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name || person.email || "Unnamed Staff"}{" "}
                        {person.role ? `(${person.role})` : ""}
                      </option>
                    ))}
                  </select>

                  <p className="mt-2 text-sm text-gray-400">
                    Current:{" "}
                    <span className="font-bold text-yellow-400">
                      {currentSalesPerson?.full_name ||
                        currentSalesPerson?.email ||
                        "-"}
                    </span>
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={savingPackageDetails || !activePackage}
                  className="mt-5 w-full rounded-xl bg-yellow-400 p-3 font-black uppercase text-black hover:bg-yellow-300 disabled:opacity-60 transition"
                >
                  {savingPackageDetails
                    ? "Saving Package Details..."
                    : "Save Package Details"}
                </button>
              </form>

              <form onSubmit={addMoreSessions} className="mt-8 print:hidden">
                <label className="mb-2 block font-black text-white">
                  Add More Sessions
                </label>

                <div className="flex gap-3">
                  <input
                    className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                    type="number"
                    min="1"
                    placeholder="Example: 10"
                    value={sessionsToAdd}
                    onChange={(e) => setSessionsToAdd(e.target.value)}
                    required
                  />

                  <button
                    type="submit"
                    disabled={addingSessions}
                    className="whitespace-nowrap rounded-xl bg-yellow-400 px-6 py-3 font-black uppercase text-black hover:bg-yellow-300 disabled:opacity-60 transition"
                  >
                    {addingSessions ? "Adding..." : "Add"}
                  </button>
                </div>
              </form>

              <div className="mt-8 rounded-2xl border border-red-500/40 bg-red-500/10 p-5 print:hidden">
                <h3 className="mb-2 text-2xl font-black text-white">
                  Subtract Session
                </h3>

                <p className="mb-4 text-sm text-gray-300">
                  Use this to manually subtract 1 session from the client. This
                  will update the package and save a record in session history.
                </p>

                <button
                  type="button"
                  onClick={markNoShow}
                  disabled={
                    markingNoShow ||
                    !activePackage ||
                    activePackage.remaining_sessions <= 0
                  }
                  className="w-full rounded-xl border border-red-400 bg-red-500 px-5 py-3 font-black uppercase text-white hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50 transition"
                >
                  {markingNoShow ? "Subtracting..." : "Subtract 1 Session"}
                </button>

                {!activePackage || activePackage.remaining_sessions <= 0 ? (
                  <p className="mt-3 text-sm font-bold text-red-300">
                    No remaining sessions available to subtract.
                  </p>
                ) : null}
              </div>

              <div className="mt-8 rounded-2xl border border-yellow-500/30 bg-black/40 p-5 print:hidden">
                <div className="mb-5">
                  <p className="text-yellow-400 font-black uppercase tracking-widest text-sm">
                    Package Renewal
                  </p>

                  <h3 className="text-2xl font-black text-white">
                    Renew Package
                  </h3>

                  <p className="mt-2 text-sm text-gray-400">
                    Add sessions, extend package expiry, and track renewal
                    history.
                  </p>
                </div>

                <div className="mb-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-yellow-500/40 bg-yellow-400/10 p-4 text-center">
                    <p className="text-sm font-bold text-gray-300">
                      Total Renewed Times
                    </p>

                    <p className="text-4xl font-black text-yellow-400">
                      {renewals.length}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-yellow-500/40 bg-yellow-400/10 p-4 text-center">
                    <p className="text-sm font-bold text-gray-300">
                      Current Expiry
                    </p>

                    <p className="text-lg font-black text-yellow-400">
                      {formatDate(activePackage?.expires_at || null)}
                    </p>
                  </div>
                </div>

                <form onSubmit={renewPackage} className="space-y-4">
                  <div>
                    <label className="mb-2 block font-black text-white">
                      Add Sessions
                    </label>

                    <input
                      className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                      type="number"
                      min="0"
                      placeholder="Example: 10"
                      value={renewSessionsToAdd}
                      onChange={(event) =>
                        setRenewSessionsToAdd(event.target.value)
                      }
                    />
                  </div>

                  <div>
                    <label className="mb-2 block font-black text-white">
                      Extend Days
                    </label>

                    <input
                      className="w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white placeholder:text-gray-500 outline-none focus:border-yellow-400"
                      type="number"
                      min="0"
                      placeholder="Example: 30"
                      value={renewExtendDays}
                      onChange={(event) => setRenewExtendDays(event.target.value)}
                    />
                  </div>

                  <div>
                    <label className="mb-2 block font-black text-white">
                      Renewal Notes
                    </label>

                    <textarea
                      className="min-h-24 w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                      placeholder="Example: Renewed monthly package, paid cash..."
                      value={renewNotes}
                      onChange={(event) => setRenewNotes(event.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={renewingPackage || !activePackage}
                    className="w-full rounded-xl bg-yellow-400 p-3 font-black uppercase text-black hover:bg-yellow-300 disabled:opacity-60 transition"
                  >
                    {renewingPackage ? "Renewing Package..." : "Renew Package"}
                  </button>
                </form>

                {renewals.length > 0 && (
                  <div className="mt-6">
                    <h4 className="mb-3 font-black text-white">
                      Renewal History
                    </h4>

                    <div className="space-y-3">
                      {renewals.slice(0, 5).map((renewal) => (
                        <div
                          key={renewal.id}
                          className="rounded-xl border border-white/10 bg-black/40 p-4"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="font-black text-yellow-400">
                              {formatDate(renewal.created_at)}
                            </p>

                            <p className="text-sm font-bold text-gray-300">
                              +{renewal.added_sessions} sessions / +
                              {renewal.extended_days} days
                            </p>
                          </div>

                          <p className="mt-2 text-sm text-gray-400">
                            Expiry: {formatDate(renewal.old_expires_at)} →{" "}
                            {formatDate(renewal.new_expires_at)}
                          </p>

                          {renewal.notes && (
                            <p className="mt-2 text-sm text-gray-300">
                              {renewal.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-8">
              <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 text-center shadow-2xl backdrop-blur print:bg-white print:border-0 print:shadow-none print:mt-8">
                <p className="mb-2 text-yellow-400 font-black uppercase tracking-widest">
                  QR Access
                </p>

                <h2 className="mb-6 text-3xl font-black text-white print:text-black">
                  Client QR Code
                </h2>

                <div className="mx-auto inline-block rounded-3xl border border-yellow-500/40 bg-white p-5">
                  {qrCode && (
                    <img
                      src={qrCode}
                      alt="Client QR Code"
                      className="mx-auto h-72 w-72 rounded-xl print:h-80 print:w-80"
                    />
                  )}
                </div>

                <p className="mx-auto mt-6 max-w-sm text-sm font-bold text-gray-300 print:text-black">
                  Trainer scans this QR code to mark one personal training
                  session.
                </p>

                <button
                  onClick={() => window.print()}
                  className="mt-6 rounded-xl bg-yellow-400 px-8 py-3 font-black uppercase text-black hover:bg-yellow-300 transition print:hidden"
                >
                  Print QR Card
                </button>
              </div>

              <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur print:hidden">
                <div className="mb-6">
                  <p className="text-yellow-400 font-black uppercase tracking-widest text-sm">
                    Session History
                  </p>

                  <h2 className="text-3xl font-black text-white">
                    Client Session History
                  </h2>

                  <p className="mt-2 text-sm text-gray-400">
                    Recent scans, manual session deductions, and remaining
                    session history.
                  </p>
                </div>

                {sessionHistory.length === 0 ? (
                  <p className="rounded-2xl border border-white/10 bg-black/40 p-4 text-sm font-bold text-gray-400">
                    No session history found for this client yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {sessionHistory.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-2xl border border-white/10 bg-black/40 p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="font-black text-yellow-400">
                            {getSessionStatusLabel(log.status)}
                          </p>

                          <p className="text-sm font-bold text-gray-400">
                            {formatDateTime(log.scanned_at)}
                          </p>
                        </div>

                        <p className="mt-2 text-sm font-bold text-gray-300">
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
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <form
                onSubmit={saveClientNotes}
                className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-8 shadow-2xl backdrop-blur print:hidden"
              >
                <div className="mb-6">
                  <p className="text-yellow-400 font-black uppercase tracking-widest text-sm">
                    Client Notes
                  </p>

                  <h2 className="text-3xl font-black text-white">
                    Training Notes
                  </h2>

                  <p className="mt-2 text-sm text-gray-400">
                    Save goals, injuries, trainer notes, and nutrition notes for
                    this client.
                  </p>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block font-black text-white">
                      Notes
                    </label>

                    <textarea
                      className="min-h-24 w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                      value={goals}
                      onChange={(event) => setGoals(event.target.value)}
                      placeholder="For example: Payment reminders, client goals, progress notes, preferences, or any important info trainers should know when working with this client."
                    />
                  </div>

                  <div>
                    <label className="mb-2 block font-black text-white">
                      Injuries
                    </label>

                    <textarea
                      className="min-h-24 w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                      value={injuries}
                      onChange={(event) => setInjuries(event.target.value)}
                      placeholder="Example: Knee pain, shoulder injury, lower back tightness..."
                    />
                  </div>

                  <div>
                    <label className="mb-2 block font-black text-white">
                      Trainer Notes
                    </label>

                    <textarea
                      className="min-h-28 w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                      value={trainerNotes}
                      onChange={(event) => setTrainerNotes(event.target.value)}
                      placeholder="Progress notes, preferences, limitations, workout focus..."
                    />
                  </div>

                  <div>
                    <label className="mb-2 block font-black text-white">
                      Nutrition Notes
                    </label>

                    <textarea
                      className="min-h-28 w-full rounded-xl border border-white/20 bg-black/50 p-3 text-white outline-none placeholder:text-gray-500 focus:border-yellow-400"
                      value={nutritionNotes}
                      onChange={(event) => setNutritionNotes(event.target.value)}
                      placeholder="Meal habits, protein goals, hydration, nutrition reminders..."
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingNotes}
                  className="mt-6 w-full rounded-xl bg-yellow-400 p-3 font-black uppercase text-black hover:bg-yellow-300 disabled:opacity-60 transition"
                >
                  {savingNotes ? "Saving Notes..." : "Save Client Notes"}
                </button>
              </form>

              <div className="rounded-3xl border border-red-500/40 bg-red-500/10 p-8 shadow-2xl backdrop-blur print:hidden">
                <div className="mb-5">
                  <p className="text-red-300 font-black uppercase tracking-widest text-sm">
                    Danger Zone
                  </p>

                  <h2 className="text-3xl font-black text-white">
                    Delete Client
                  </h2>

                  <p className="mt-2 text-sm text-red-100/80">
                    This permanently removes this client, their packages, notes,
                    purchases, login codes, renewal history, and session history.
                    This cannot be undone.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={deleteClient}
                  disabled={deletingClient}
                  className="w-full rounded-xl border border-red-300 bg-red-600 p-3 font-black uppercase text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deletingClient ? "Deleting Client..." : "Delete Client"}
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}