"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";

import { getCurrentUserRole } from "../../../lib/checkUserRole";
import {
  canEditClientBasicInfo,
  canEditDebt,
  canEditPackages,
  getRoleDisplayName,
  isAdminOrManager,
  normalizeRole,
  type AppRole,
} from "../../../lib/role";

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
  sales_person_id: string | null;
  assigned_trainer_id: string | null;
  assigned_nutrition_coach_id: string | null;
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
  role?: string | null;
};

type SessionAdjustAction = "add" | "subtract" | "fix";

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

function formatDate(value: string | null | undefined) {
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

function formatDateInput(value: string | null | undefined) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toISOString().slice(0, 10);
}

function getTodayInputDate() {
  return new Date().toISOString().slice(0, 10);
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
  if (value === "renewal") return "Renew";
  if (value === "paid") return "Paid";
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
  deadline: string | null,
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

function getPackageNumbers(packageRow: SessionPackage | null) {
  const totalSessions = Number(packageRow?.total_sessions || 0);
  const usedSessions = Number(packageRow?.used_sessions || 0);

  const remainingSessions =
    packageRow?.remaining_sessions !== null &&
    packageRow?.remaining_sessions !== undefined
      ? Number(packageRow.remaining_sessions)
      : Math.max(totalSessions - usedSessions, 0);

  return {
    totalSessions,
    usedSessions,
    remainingSessions,
  };
}

export default function AdminClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const clientId = params.id as string;
  const action = searchParams.get("action");

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [packages, setPackages] = useState<SessionPackage[]>([]);
  const [purchases, setPurchases] = useState<ClientPurchase[]>([]);
  const [sessionHistory, setSessionHistory] = useState<SessionHistory[]>([]);
  const [qrCode, setQrCode] = useState("");

  const [salesPeople, setSalesPeople] = useState<TrainerProfile[]>([]);
  const [selectedSalesPersonId, setSelectedSalesPersonId] = useState("");
  const [savingSalesPerson, setSavingSalesPerson] = useState(false);

  const [trainerOptions, setTrainerOptions] = useState<TrainerProfile[]>([]);
  const [nutritionCoachOptions, setNutritionCoachOptions] = useState<
    TrainerProfile[]
  >([]);
  const [selectedTrainerId, setSelectedTrainerId] = useState("");
  const [selectedNutritionCoachId, setSelectedNutritionCoachId] = useState("");
  const [savingStaffAssignment, setSavingStaffAssignment] = useState(false);

  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [checkingMessage, setCheckingMessage] = useState(
    "Checking client access...",
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
  const [packageTotalSessions, setPackageTotalSessions] = useState("");
  const [packageValue, setPackageValue] = useState("");
  const [packageAmountPaid, setPackageAmountPaid] = useState("");
  const [packageStartDate, setPackageStartDate] = useState("");
  const [packageExpireDate, setPackageExpireDate] = useState("");

  const [uploadedPurchaseType, setUploadedPurchaseType] = useState("");
  const [savingUploadedPurchaseType, setSavingUploadedPurchaseType] =
    useState(false);

  const [renewPackageMode, setRenewPackageMode] = useState(false);
  const [savingPackage, setSavingPackage] = useState(false);

  const [sessionAdjustValue, setSessionAdjustValue] = useState("");
  const [sessionAdjustAction, setSessionAdjustAction] =
    useState<SessionAdjustAction | null>(null);

  const [debtAmount, setDebtAmount] = useState("");
  const [debtDeadline, setDebtDeadline] = useState("");
  const [savingDebt, setSavingDebt] = useState(false);

  const [newDebtAmount, setNewDebtAmount] = useState("");
  const [newDebtDeadline, setNewDebtDeadline] = useState("");
  const [newDebtNote, setNewDebtNote] = useState("");
  const [addingDebt, setAddingDebt] = useState(false);
  const [completingDebtId, setCompletingDebtId] = useState<string | null>(null);
  const [debtPaymentAmounts, setDebtPaymentAmounts] = useState<
    Record<string, string>
  >({});
  const [debtPaymentDates, setDebtPaymentDates] = useState<
    Record<string, string>
  >({});
  const [debtFixAddsRevenue, setDebtFixAddsRevenue] = useState(true);
  const [debtFixRevenueDate, setDebtFixRevenueDate] =
    useState(getTodayInputDate());

  const roleLabel = getRoleDisplayName(userRole);
  const allowBasicInfoEdit = canEditClientBasicInfo(userRole);
  const allowPackageEdit = canEditPackages(userRole);
  const allowDebtEdit = canEditDebt(userRole);
  const isAdmin = userRole === "admin";

  function scrollToPackageSection() {
    document
      .getElementById("package-renew-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToSessionControlSection() {
    document
      .getElementById("session-control-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToDebtSection() {
    document
      .getElementById("debt-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToSalesPersonSection() {
    document
      .getElementById("sales-person-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToStaffAssignmentSection() {
    document
      .getElementById("staff-assignment-section")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function startRenewPackage() {
    setRenewPackageMode(true);
    window.setTimeout(scrollToPackageSection, 100);
  }

  async function fetchSessionHistory() {
    const { data: historyData, error: historyError } = await supabase
      .from("session_history")
      .select(
        "id, trainer_id, status, message, trainer_note, remaining_after, created_at",
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
          .filter((trainerId): trainerId is string => Boolean(trainerId)),
      ),
    );

    if (trainerIds.length === 0) {
      setSessionHistory(
        rawHistory.map((log) => ({
          ...log,
          trainer_name: "Admin / Manual",
        })),
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
      ]),
    );

    setSessionHistory(
      rawHistory.map((log) => ({
        ...log,
        trainer_name:
          log.trainer_id && trainerNameMap.get(log.trainer_id)
            ? trainerNameMap.get(log.trainer_id)!
            : "Admin / Manual",
      })),
    );
  }

  async function fetchClientDetail() {
    setLoading(true);

    const [clientResult, packageResult, purchaseResult, salesPeopleResult] =
      await Promise.all([
        supabase
          .from("clients")
          .select(
            "id, client_code, full_name, email, phone, gender, date_of_birth, qr_token, activation_code, status, client_note, client_source, client_source_other, sales_person_id, assigned_trainer_id, assigned_nutrition_coach_id, created_at",
          )
          .eq("id", clientId)
          .maybeSingle(),

        supabase
          .from("session_packages")
          .select(
            "id, client_id, total_sessions, used_sessions, remaining_sessions, status, starts_at, expires_at, package_name, package_value, created_at",
          )
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),

        supabase
          .from("client_purchases")
          .select(
            "id, client_id, plan_name, session_count, price, amount_paid, balance_due, debt_deadline, purchase_type, status, created_at",
          )
          .eq("client_id", clientId)
          .order("created_at", { ascending: false }),

        supabase
          .from("profiles")
          .select("id, full_name, role")
          .in("role", ["trainer", "nutrition_coach"])
          .order("full_name", { ascending: true }),
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

    if (salesPeopleResult.error) {
      alert(salesPeopleResult.error.message);
      setLoading(false);
      return;
    }

    const cleanClient = clientResult.data as ClientDetail;
    const cleanPackages = (packageResult.data || []) as SessionPackage[];
    const cleanPurchases = (purchaseResult.data || []) as ClientPurchase[];

    const latestPurchase = cleanPurchases[0] || null;
    const firstDebtPurchase =
      cleanPurchases.find(
        (purchase) => Number(purchase.balance_due || 0) > 0,
      ) || latestPurchase;

    setClient(cleanClient);
    setPackages(cleanPackages);
    setPurchases(cleanPurchases);
    const cleanStaffPeople = (salesPeopleResult.data || []) as TrainerProfile[];

    setSalesPeople(cleanStaffPeople);
    setTrainerOptions(
      cleanStaffPeople.filter((person) => person.role === "trainer"),
    );
    setNutritionCoachOptions(
      cleanStaffPeople.filter((person) => person.role === "nutrition_coach"),
    );

    setSelectedSalesPersonId(cleanClient.sales_person_id || "");
    setSelectedTrainerId(cleanClient.assigned_trainer_id || "");
    setSelectedNutritionCoachId(cleanClient.assigned_nutrition_coach_id || "");

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

    setPackageName("");
    setPackageTotalSessions("");
    setPackageValue("");
    setPackageAmountPaid("");
    setPackageStartDate("");
    setPackageExpireDate("");
    setUploadedPurchaseType(latestPurchase?.purchase_type || "");
    setRenewPackageMode(action === "renew");

    setDebtAmount(
      firstDebtPurchase?.balance_due !== null &&
        firstDebtPurchase?.balance_due !== undefined
        ? String(firstDebtPurchase.balance_due)
        : "",
    );
    setDebtDeadline(formatDateInput(firstDebtPurchase?.debt_deadline || null));

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

    if (!isAdmin) {
      alert("Only admins can generate activation codes.");
      return;
    }

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

    if (!allowBasicInfoEdit) {
      alert("You do not have permission to edit client information.");
      return;
    }

    if (!editName.trim()) {
      alert("Client name is required.");
      return;
    }

    if (editClientSource === "other" && !editClientSourceOther.trim()) {
      alert("Please specify the other client source.");
      return;
    }

    setSavingClientInfo(true);

    const updatePayload =
      userRole === "admin"
        ? {
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
          }
        : {
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
          };

    const { error } = await supabase
      .from("clients")
      .update(updatePayload)
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

  async function saveSalesPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!client) return;

    if (!allowBasicInfoEdit) {
      alert("You do not have permission to assign a sale person.");
      return;
    }

    setSavingSalesPerson(true);

    const { error } = await supabase
      .from("clients")
      .update({
        sales_person_id: selectedSalesPersonId || null,
      })
      .eq("id", client.id);

    if (error) {
      alert(error.message);
      setSavingSalesPerson(false);
      return;
    }

    alert("Sale person saved.");
    await fetchClientDetail();
    setSavingSalesPerson(false);
  }

  async function saveStaffAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!client) return;

    if (!allowBasicInfoEdit) {
      alert("You do not have permission to assign staff.");
      return;
    }

    setSavingStaffAssignment(true);

    const { error } = await supabase
      .from("clients")
      .update({
        assigned_trainer_id: selectedTrainerId || null,
        assigned_nutrition_coach_id: selectedNutritionCoachId || null,
      })
      .eq("id", client.id);

    if (error) {
      alert(error.message);
      setSavingStaffAssignment(false);
      return;
    }

    alert("Trainer and Nutrition Coach assignment saved.");
    await fetchClientDetail();
    setSavingStaffAssignment(false);
  }

  async function saveUploadedPurchaseType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!client) return;

    if (!allowPackageEdit) {
      alert("Only admins can edit uploaded purchase type.");
      return;
    }

    if (!uploadedPurchaseType) {
      alert("Please select New or Renew.");
      return;
    }

    const latestPurchase = purchases[0] || null;

    setSavingUploadedPurchaseType(true);

    if (latestPurchase) {
      const { error } = await supabase
        .from("client_purchases")
        .update({
          purchase_type: uploadedPurchaseType,
        })
        .eq("id", latestPurchase.id);

      if (error) {
        alert(error.message);
        setSavingUploadedPurchaseType(false);
        return;
      }
    } else {
      const { error } = await supabase.from("client_purchases").insert({
        client_id: client.id,
        plan_name: "Uploaded Purchase",
        session_count: 0,
        price: 0,
        amount_paid: 0,
        balance_due: 0,
        purchase_type: uploadedPurchaseType,
        status: "paid",
        created_at: new Date().toISOString(),
      });

      if (error) {
        alert(error.message);
        setSavingUploadedPurchaseType(false);
        return;
      }
    }

    alert(`Uploaded purchase type saved as ${uploadedPurchaseType}.`);
    await fetchClientDetail();
    setSavingUploadedPurchaseType(false);
  }

  async function saveNewRenewPackage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!client) return;

    if (!allowPackageEdit) {
      alert("Only admins can renew packages.");
      return;
    }

    const addedSessions = packageTotalSessions.trim()
      ? Number(packageTotalSessions)
      : null;

    const numericPackageValue = packageValue.trim()
      ? Number(packageValue)
      : null;

    const numericAmountPaid = packageAmountPaid.trim()
      ? Number(packageAmountPaid)
      : (numericPackageValue ?? 0);

    if (
      addedSessions === null ||
      Number.isNaN(addedSessions) ||
      addedSessions <= 0
    ) {
      alert("Sessions to add must be a valid number greater than 0.");
      return;
    }

    if (
      numericPackageValue !== null &&
      (Number.isNaN(numericPackageValue) || numericPackageValue < 0)
    ) {
      alert("Package value must be a valid number.");
      return;
    }

    if (Number.isNaN(numericAmountPaid) || numericAmountPaid < 0) {
      alert("Amount paid must be a valid number.");
      return;
    }

    const cleanPackageValue = numericPackageValue ?? 0;
    const cleanAmountPaid = Math.min(numericAmountPaid, cleanPackageValue);
    const balanceDue = Math.max(cleanPackageValue - cleanAmountPaid, 0);

    const currentPackage = packages[0] || null;

    setSavingPackage(true);

    if (currentPackage) {
      const { totalSessions, usedSessions, remainingSessions } =
        getPackageNumbers(currentPackage);

      const currentPackageValue = Number(currentPackage.package_value || 0);

      const newTotalSessions = totalSessions + addedSessions;
      const newRemainingSessions = remainingSessions + addedSessions;
      const newPackageValue = currentPackageValue + cleanPackageValue;

      const { error: packageUpdateError } = await supabase
        .from("session_packages")
        .update({
          package_name:
            packageName.trim() ||
            currentPackage.package_name ||
            "Renew Package",
          total_sessions: newTotalSessions,
          used_sessions: usedSessions,
          remaining_sessions: newRemainingSessions,
          package_value: newPackageValue,
          starts_at: packageStartDate
            ? new Date(`${packageStartDate}T00:00:00`).toISOString()
            : currentPackage.starts_at,
          expires_at: packageExpireDate
            ? new Date(`${packageExpireDate}T23:59:59`).toISOString()
            : currentPackage.expires_at,
          status: "active",
        })
        .eq("id", currentPackage.id);

      if (packageUpdateError) {
        alert(packageUpdateError.message);
        setSavingPackage(false);
        return;
      }
    } else {
      const { error: packageInsertError } = await supabase
        .from("session_packages")
        .insert({
          client_id: client.id,
          package_name: packageName.trim() || "Renew Package",
          total_sessions: addedSessions,
          used_sessions: 0,
          remaining_sessions: addedSessions,
          package_value: cleanPackageValue,
          starts_at: packageStartDate
            ? new Date(`${packageStartDate}T00:00:00`).toISOString()
            : null,
          expires_at: packageExpireDate
            ? new Date(`${packageExpireDate}T23:59:59`).toISOString()
            : null,
          status: "active",
          created_at: new Date().toISOString(),
        });

      if (packageInsertError) {
        alert(packageInsertError.message);
        setSavingPackage(false);
        return;
      }
    }

    const { error: purchaseInsertError } = await supabase
      .from("client_purchases")
      .insert({
        client_id: client.id,
        plan_name: packageName.trim() || "Renew Package",
        session_count: addedSessions,
        price: cleanPackageValue,
        amount_paid: cleanAmountPaid,
        balance_due: balanceDue,
        debt_deadline: balanceDue > 0 ? packageExpireDate || null : null,
        purchase_type: "renew",
        status: "paid",
        created_at: new Date().toISOString(),
      });

    if (purchaseInsertError) {
      alert(purchaseInsertError.message);
      setSavingPackage(false);
      return;
    }

    setPackageName("");
    setPackageTotalSessions("");
    setPackageValue("");
    setPackageAmountPaid("");
    setPackageStartDate("");
    setPackageExpireDate("");

    alert(`Renew completed. Added ${addedSessions} sessions.`);
    await fetchClientDetail();
    setRenewPackageMode(false);
    setSavingPackage(false);
  }

  async function adjustClientSessions(actionType: SessionAdjustAction) {
    if (!client) return;

    if (!allowPackageEdit) {
      alert("Only admins can adjust sessions.");
      return;
    }

    const currentPackage = packages[0] || null;

    if (!currentPackage) {
      alert("No package found. Please renew/add a package first.");
      return;
    }

    const amount = sessionAdjustValue.trim()
      ? Number(sessionAdjustValue)
      : null;

    if (amount === null || Number.isNaN(amount) || amount < 0) {
      alert("Please enter a valid session number.");
      return;
    }

    if ((actionType === "add" || actionType === "subtract") && amount <= 0) {
      alert("Session amount must be greater than 0.");
      return;
    }

    const { totalSessions, usedSessions, remainingSessions } =
      getPackageNumbers(currentPackage);

    let nextTotalSessions = totalSessions;
    let nextUsedSessions = usedSessions;
    let nextRemainingSessions = remainingSessions;

    if (actionType === "add") {
      nextTotalSessions = totalSessions + amount;
      nextUsedSessions = usedSessions;
      nextRemainingSessions = remainingSessions + amount;
    }

    if (actionType === "subtract") {
      if (amount > remainingSessions) {
        alert(
          `Cannot subtract ${amount} sessions. Client only has ${remainingSessions} remaining.`,
        );
        return;
      }

      nextTotalSessions = totalSessions;
      nextUsedSessions = usedSessions + amount;
      nextRemainingSessions = remainingSessions - amount;
    }

    if (actionType === "fix") {
      nextRemainingSessions = amount;
      nextUsedSessions = usedSessions;
      nextTotalSessions = usedSessions + amount;
    }

    const confirmed = window.confirm(
      `Confirm session update?\n\nBefore:\nTotal: ${totalSessions}\nUsed: ${usedSessions}\nRemaining: ${remainingSessions}\n\nAfter:\nTotal: ${nextTotalSessions}\nUsed: ${nextUsedSessions}\nRemaining: ${nextRemainingSessions}`,
    );

    if (!confirmed) return;

    setSessionAdjustAction(actionType);

    const { error } = await supabase
      .from("session_packages")
      .update({
        total_sessions: nextTotalSessions,
        used_sessions: nextUsedSessions,
        remaining_sessions: nextRemainingSessions,
        status: nextRemainingSessions <= 0 ? "completed" : "active",
      })
      .eq("id", currentPackage.id);

    if (error) {
      alert(error.message);
      setSessionAdjustAction(null);
      return;
    }

    setSessionAdjustValue("");
    alert("Sessions updated.");
    await fetchClientDetail();
    setSessionAdjustAction(null);
  }

  async function addDebtRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!client) return;

    if (!allowDebtEdit) {
      alert("Only admins can add debt records.");
      return;
    }

    const numericDebtAmount = newDebtAmount.trim() ? Number(newDebtAmount) : 0;

    if (Number.isNaN(numericDebtAmount) || numericDebtAmount <= 0) {
      alert("Debt amount must be greater than 0.");
      return;
    }

    if (!newDebtDeadline) {
      alert("Please add a deadline for this debt.");
      return;
    }

    setAddingDebt(true);

    const { error } = await supabase.from("client_purchases").insert({
      client_id: client.id,
      plan_name: newDebtNote.trim() || "Manual Debt",
      session_count: 0,
      price: numericDebtAmount,
      amount_paid: 0,
      balance_due: numericDebtAmount,
      debt_deadline: newDebtDeadline,
      purchase_type: "renew",
      status: "confirmed",
      created_at: new Date().toISOString(),
    });

    if (error) {
      alert(error.message);
      setAddingDebt(false);
      return;
    }

    setNewDebtAmount("");
    setNewDebtDeadline("");
    setNewDebtNote("");

    alert("Debt record added.");
    await fetchClientDetail();
    setAddingDebt(false);
  }

  async function completeDebtRecord(purchase: ClientPurchase) {
    if (!client) return;

    if (!allowDebtEdit) {
      alert("Only admins can record debt payments.");
      return;
    }

    const currentBalance = Number(purchase.balance_due || 0);

    if (currentBalance <= 0) {
      alert("This debt is already complete.");
      return;
    }

    const paymentAmountText =
      debtPaymentAmounts[purchase.id] ?? String(currentBalance);

    const paymentAmount = Number(paymentAmountText);

    if (Number.isNaN(paymentAmount) || paymentAmount <= 0) {
      alert("Payment amount must be greater than 0.");
      return;
    }

    if (paymentAmount > currentBalance) {
      alert(
        `Payment cannot be greater than current debt balance: ${formatMoney(
          currentBalance,
        )}`,
      );
      return;
    }

    const paymentDate = debtPaymentDates[purchase.id] || getTodayInputDate();

    if (!paymentDate) {
      alert("Payment date is required.");
      return;
    }

    const newBalance = Math.max(currentBalance - paymentAmount, 0);
    const currentPaid = Number(purchase.amount_paid || 0);
    const newPaidAmount = currentPaid + paymentAmount;

    const confirmed = window.confirm(
      `Record debt payment?

Client: ${client.full_name}
Payment: ${formatMoney(paymentAmount)}
Current Debt: ${formatMoney(currentBalance)}
New Debt Balance: ${formatMoney(newBalance)}

This will also add income to Revenue.`,
    );

    if (!confirmed) return;

    setCompletingDebtId(purchase.id);

    const { data: userData } = await supabase.auth.getUser();

    const { error: purchaseUpdateError } = await supabase
      .from("client_purchases")
      .update({
        amount_paid: newPaidAmount,
        balance_due: newBalance,
        debt_deadline: newBalance > 0 ? purchase.debt_deadline : null,
        status: "paid",
      })
      .eq("id", purchase.id);

    if (purchaseUpdateError) {
      alert(purchaseUpdateError.message);
      setCompletingDebtId(null);
      return;
    }

    const { error: incomeInsertError } = await supabase
      .from("business_transactions")
      .insert({
        transaction_type: "income",
        source: "debt_payment",
        title: `Debt payment - ${client.full_name}`,
        amount: paymentAmount,
        notes: [
          `Client: ${client.full_name}`,
          `Client Code: ${client.client_code || "-"}`,
          `Debt Record: ${purchase.plan_name || "Manual Debt"}`,
          `Original Balance: ${formatMoney(currentBalance)}`,
          `Payment Received: ${formatMoney(paymentAmount)}`,
          `Remaining Balance: ${formatMoney(newBalance)}`,
        ].join(" | "),
        created_by: userData.user?.id || null,
        transaction_date: paymentDate,
      });

    if (incomeInsertError) {
      alert(
        `Debt balance was updated, but income was not recorded: ${incomeInsertError.message}`,
      );
      setCompletingDebtId(null);
      await fetchClientDetail();
      return;
    }

    setDebtPaymentAmounts((current) => {
      const next = { ...current };
      delete next[purchase.id];
      return next;
    });

    setDebtPaymentDates((current) => {
      const next = { ...current };
      delete next[purchase.id];
      return next;
    });

    alert(
      newBalance <= 0
        ? "Debt payment recorded. Debt is now complete. Revenue income was added."
        : "Partial debt payment recorded. Revenue income was added.",
    );

    await fetchClientDetail();
    setCompletingDebtId(null);
  }

  async function saveDebtDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!client) return;

    if (!allowDebtEdit) {
      alert("Only admins can edit debt details.");
      return;
    }

    const debtPurchase =
      purchases.find((purchase) => Number(purchase.balance_due || 0) > 0) ||
      purchases[0] ||
      null;

    const numericDebtAmount = debtAmount.trim() ? Number(debtAmount) : 0;

    if (Number.isNaN(numericDebtAmount) || numericDebtAmount < 0) {
      alert("Debt must be a valid number.");
      return;
    }

    if (numericDebtAmount > 0 && !debtDeadline) {
      alert("Please add a deadline for this debt.");
      return;
    }

    if (debtFixAddsRevenue && !debtFixRevenueDate) {
      alert("Revenue date is required when adding the debt fix to Revenue.");
      return;
    }

    const oldDebtAmount = debtPurchase
      ? Number(debtPurchase.balance_due || 0)
      : 0;
    const debtReductionAmount = debtPurchase
      ? Math.max(oldDebtAmount - numericDebtAmount, 0)
      : 0;
    const shouldAddRevenue = debtFixAddsRevenue && debtReductionAmount > 0;
    const nextPaidAmount = shouldAddRevenue
      ? Number(debtPurchase?.amount_paid || 0) + debtReductionAmount
      : Number(debtPurchase?.amount_paid || 0);

    const confirmed = window.confirm(
      shouldAddRevenue
        ? `Save debt fix and add revenue?

Client: ${client.full_name}
Old Debt: ${formatMoney(oldDebtAmount)}
New Debt: ${formatMoney(numericDebtAmount)}
Revenue Added: ${formatMoney(debtReductionAmount)}

This will create an Income transaction on the Revenue page.`
        : `Save debt correction?

Client: ${client.full_name}
Old Debt: ${formatMoney(oldDebtAmount)}
New Debt: ${formatMoney(numericDebtAmount)}

No revenue transaction will be created.`,
    );

    if (!confirmed) return;

    setSavingDebt(true);

    if (debtPurchase) {
      const purchaseUpdatePayload = {
        amount_paid: nextPaidAmount,
        balance_due: numericDebtAmount,
        debt_deadline: numericDebtAmount > 0 ? debtDeadline : null,
        status: "paid",
      };

      const { error } = await supabase
        .from("client_purchases")
        .update(purchaseUpdatePayload)
        .eq("id", debtPurchase.id);

      if (error) {
        alert(error.message);
        setSavingDebt(false);
        return;
      }

      if (shouldAddRevenue) {
        const { data: userData } = await supabase.auth.getUser();

        const { error: incomeInsertError } = await supabase
          .from("business_transactions")
          .insert({
            transaction_type: "income",
            source: "debt_payment",
            title: `Debt fix payment - ${client.full_name}`,
            amount: debtReductionAmount,
            notes: [
              `Client: ${client.full_name}`,
              `Client Code: ${client.client_code || "-"}`,
              `Debt Record: ${debtPurchase.plan_name || "Manual Debt"}`,
              `Old Debt Balance: ${formatMoney(oldDebtAmount)}`,
              `New Debt Balance: ${formatMoney(numericDebtAmount)}`,
              `Revenue Added From Debt Fix: ${formatMoney(debtReductionAmount)}`,
            ].join(" | "),
            created_by: userData.user?.id || null,
            transaction_date: debtFixRevenueDate,
          });

        if (incomeInsertError) {
          alert(
            `Debt was updated, but revenue was not recorded: ${incomeInsertError.message}`,
          );
          setSavingDebt(false);
          await fetchClientDetail();
          return;
        }
      }
    } else {
      const { error } = await supabase.from("client_purchases").insert({
        client_id: client.id,
        plan_name: "Manual Debt",
        session_count: 0,
        price: numericDebtAmount,
        amount_paid: 0,
        balance_due: numericDebtAmount,
        debt_deadline: numericDebtAmount > 0 ? debtDeadline : null,
        purchase_type: "renew",
        status: "confirmed",
        created_at: new Date().toISOString(),
      });

      if (error) {
        alert(error.message);
        setSavingDebt(false);
        return;
      }
    }

    alert(
      shouldAddRevenue
        ? "Debt fix saved and revenue income was added."
        : "Debt details saved.",
    );
    await fetchClientDetail();
    setSavingDebt(false);
  }

  async function toggleClientStatus() {
    if (!client) return;

    if (!allowBasicInfoEdit) {
      alert("You do not have permission to change client status.");
      return;
    }

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

      if (!isAdminOrManager(role)) {
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

      setUserRole(normalizeRole(role));
      setCheckingRole(false);
      await fetchClientDetail();
    }

    protectPage();
  }, [router, clientId]);

  useEffect(() => {
    if (action === "renew" && !loading) {
      setRenewPackageMode(true);
      window.setTimeout(scrollToPackageSection, 300);
    }
  }, [action, loading]);

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

  const activeDebtPurchases = purchases.filter(
    (purchase) => Number(purchase.balance_due || 0) > 0,
  );

  const completedDebtPurchases = purchases.filter((purchase) => {
    const paidAmount = Number(purchase.amount_paid || 0);
    const balanceDue = Number(purchase.balance_due || 0);
    const price = Number(purchase.price || 0);
    const planName = (purchase.plan_name || "").toLowerCase();

    return (
      balanceDue <= 0 &&
      paidAmount > 0 &&
      (price === 0 || planName.includes("debt"))
    );
  });

  const totalClientDebt = activeDebtPurchases.reduce(
    (sum, purchase) => sum + Number(purchase.balance_due || 0),
    0,
  );

  const totalCompletedDebt = completedDebtPurchases.reduce(
    (sum, purchase) => sum + Number(purchase.amount_paid || 0),
    0,
  );

  const debtPurchase = activeDebtPurchases[0] || latestPurchase;
  const currentDebtBalanceForFix = Number(debtPurchase?.balance_due || 0);
  const nextDebtBalanceForFix = debtAmount.trim() ? Number(debtAmount) : 0;
  const debtFixRevenueAmount =
    !Number.isNaN(nextDebtBalanceForFix) &&
    currentDebtBalanceForFix > nextDebtBalanceForFix
      ? currentDebtBalanceForFix - nextDebtBalanceForFix
      : 0;
  const debtFixWillAddRevenue = debtFixAddsRevenue && debtFixRevenueAmount > 0;

  const debtNotice = getDebtNotice(
    totalClientDebt,
    debtPurchase?.debt_deadline || null,
  );

  const selectedSalesPerson = salesPeople.find(
    (person) => person.id === client.sales_person_id,
  );

  const selectedTrainer = trainerOptions.find(
    (person) => person.id === client.assigned_trainer_id,
  );

  const selectedNutritionCoach = nutritionCoachOptions.find(
    (person) => person.id === client.assigned_nutrition_coach_id,
  );

  const activePackageNumbers = getPackageNumbers(activePackage);

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
                View client profile, QR code, sale person, packages, session
                control, debt records, completed debt, and recent sessions.
              </p>

              <p className="mt-3 inline-flex rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-1 text-xs font-normal text-yellow-300">
                Signed in as {roleLabel}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {isAdmin && (
                <button
                  type="button"
                  onClick={startRenewPackage}
                  className="rounded-2xl bg-green-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-green-300"
                >
                  Renew Package
                </button>
              )}

              {allowPackageEdit && (
                <button
                  type="button"
                  onClick={scrollToSessionControlSection}
                  className="rounded-2xl bg-cyan-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-cyan-300"
                >
                  Fix Sessions
                </button>
              )}

              {allowDebtEdit && (
                <button
                  type="button"
                  onClick={scrollToDebtSection}
                  className="rounded-2xl bg-red-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-red-300"
                >
                  Add Debt
                </button>
              )}

              {allowBasicInfoEdit && (
                <button
                  type="button"
                  onClick={scrollToSalesPersonSection}
                  className="rounded-2xl bg-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-yellow-300"
                >
                  Add Sale Person
                </button>
              )}

              {allowBasicInfoEdit && (
                <button
                  type="button"
                  onClick={scrollToStaffAssignmentSection}
                  className="rounded-2xl bg-purple-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-purple-300"
                >
                  Assign PT / NC
                </button>
              )}

              {allowBasicInfoEdit && (
                <button
                  type="button"
                  onClick={toggleClientStatus}
                  className="rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                >
                  {client.status === "active" ? "Deactivate" : "Reactivate"}
                </button>
              )}

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

                <p className="mt-2 text-sm font-normal text-gray-400">
                  Sale Person:{" "}
                  <span className="text-yellow-300">
                    {selectedSalesPerson?.full_name || "Not assigned"}
                  </span>
                </p>

                <p className="mt-2 text-sm font-normal text-gray-400">
                  Personal Trainer:{" "}
                  <span className="text-purple-300">
                    {selectedTrainer?.full_name || "Not assigned"}
                  </span>
                </p>

                <p className="mt-2 text-sm font-normal text-gray-400">
                  Nutrition Coach:{" "}
                  <span className="text-green-300">
                    {selectedNutritionCoach?.full_name || "Not assigned"}
                  </span>
                </p>
              </div>

              <div className="flex flex-col items-start gap-2 md:items-end">
                <span
                  className={`w-fit rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide ${getStatusClass(
                    client.status,
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

          <section
            id="sales-person-section"
            className="mb-6 rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                  Sale Person
                </p>

                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Assigned Staff
                </h2>

                <p className="mt-2 text-sm font-normal text-gray-400">
                  Choose from trainers and nutrition coaches. This name will
                  show on the client table.
                </p>
              </div>

              <div className="rounded-2xl border border-yellow-400/20 bg-black/40 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Current
                </p>
                <p className="mt-1 text-sm font-semibold text-yellow-300">
                  {selectedSalesPerson?.full_name || "Not assigned"}
                </p>
              </div>
            </div>

            <form
              onSubmit={saveSalesPerson}
              className="mt-5 grid gap-4 md:grid-cols-[1fr_auto]"
            >
              <select
                value={selectedSalesPersonId}
                onChange={(event) =>
                  setSelectedSalesPersonId(event.target.value)
                }
                disabled={!allowBasicInfoEdit}
                className="w-full rounded-2xl border border-yellow-500/30 bg-white px-4 py-3 text-sm font-normal text-black outline-none focus:border-yellow-400 disabled:opacity-70"
              >
                <option value="">No sale person</option>

                {salesPeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.full_name || "Unnamed Staff"}{" "}
                    {person.role === "nutrition_coach"
                      ? "(Nutrition Coach)"
                      : "(Trainer)"}
                  </option>
                ))}
              </select>

              {allowBasicInfoEdit && (
                <button
                  type="submit"
                  disabled={savingSalesPerson}
                  className="rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-yellow-300 disabled:opacity-60"
                >
                  {savingSalesPerson ? "Saving..." : "Save Sale Person"}
                </button>
              )}
            </form>
          </section>

          <section
            id="staff-assignment-section"
            className="mb-6 rounded-[2rem] border border-purple-500/30 bg-purple-500/10 p-6 shadow-2xl backdrop-blur"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-purple-300">
                  Staff Assignment
                </p>

                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Assign Personal Trainer & Nutrition Coach
                </h2>

                <p className="mt-2 text-sm font-normal text-gray-300">
                  This controls who is responsible for training and nutrition
                  support. Staff will see these names in Client Management.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-purple-400/20 bg-black/40 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Current PT
                  </p>
                  <p className="mt-1 text-sm font-semibold text-purple-300">
                    {selectedTrainer?.full_name || "Not assigned"}
                  </p>
                </div>

                <div className="rounded-2xl border border-green-400/20 bg-black/40 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Current NC
                  </p>
                  <p className="mt-1 text-sm font-semibold text-green-300">
                    {selectedNutritionCoach?.full_name || "Not assigned"}
                  </p>
                </div>
              </div>
            </div>

            <form
              onSubmit={saveStaffAssignment}
              className="mt-5 grid gap-4 md:grid-cols-2"
            >
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-purple-300">
                  Personal Trainer
                </span>

                <select
                  value={selectedTrainerId}
                  onChange={(event) => setSelectedTrainerId(event.target.value)}
                  disabled={!allowBasicInfoEdit}
                  className="w-full rounded-2xl border border-purple-400 bg-white px-4 py-3 text-sm font-normal text-black outline-none focus:border-purple-300 disabled:opacity-70"
                >
                  <option value="">No personal trainer</option>

                  {trainerOptions.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name || "Unnamed Trainer"}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-green-300">
                  Nutrition Coach
                </span>

                <select
                  value={selectedNutritionCoachId}
                  onChange={(event) =>
                    setSelectedNutritionCoachId(event.target.value)
                  }
                  disabled={!allowBasicInfoEdit}
                  className="w-full rounded-2xl border border-green-400 bg-white px-4 py-3 text-sm font-normal text-black outline-none focus:border-green-300 disabled:opacity-70"
                >
                  <option value="">No nutrition coach</option>

                  {nutritionCoachOptions.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name || "Unnamed Nutrition Coach"}
                    </option>
                  ))}
                </select>
              </label>

              {allowBasicInfoEdit && (
                <div className="md:col-span-2">
                  <button
                    type="submit"
                    disabled={savingStaffAssignment}
                    className="rounded-2xl bg-purple-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-purple-300 disabled:opacity-60"
                  >
                    {savingStaffAssignment
                      ? "Saving..."
                      : "Save PT / NC Assignment"}
                  </button>
                </div>
              )}
            </form>
          </section>

          <section className="mb-6 grid gap-6 lg:grid-cols-[1.35fr_0.65fr]">
            <form
              onSubmit={saveClientInfo}
              className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-6 shadow-2xl backdrop-blur"
            >
              <h2 className="text-2xl font-semibold">Client Info</h2>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {isAdmin && (
                  <label>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                      Client Code
                    </span>
                    <input
                      value={editClientCode}
                      onChange={(event) =>
                        setEditClientCode(event.target.value)
                      }
                      className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                    />
                  </label>
                )}

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Full Name
                  </span>
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    disabled={!allowBasicInfoEdit}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400 disabled:opacity-70"
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
                    disabled={!allowBasicInfoEdit}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400 disabled:opacity-70"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Phone
                  </span>
                  <input
                    value={editPhone}
                    onChange={(event) => setEditPhone(event.target.value)}
                    disabled={!allowBasicInfoEdit}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400 disabled:opacity-70"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Gender
                  </span>
                  <input
                    value={editGender}
                    onChange={(event) => setEditGender(event.target.value)}
                    disabled={!allowBasicInfoEdit}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400 disabled:opacity-70"
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
                    disabled={!allowBasicInfoEdit}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400 disabled:opacity-70"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Client Source
                  </span>
                  <select
                    value={editClientSource}
                    onChange={(event) =>
                      setEditClientSource(event.target.value)
                    }
                    disabled={!allowBasicInfoEdit}
                    className="w-full rounded-2xl border border-yellow-500/30 bg-white px-4 py-3 text-sm font-normal text-black outline-none focus:border-yellow-400 disabled:opacity-70"
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
                      disabled={!allowBasicInfoEdit}
                      className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400 disabled:opacity-70"
                    />
                  </label>
                ) : null}
              </div>

              {isAdmin && (
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
              )}

              {allowBasicInfoEdit && (
                <button
                  type="submit"
                  disabled={savingClientInfo}
                  className="mt-5 rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-yellow-300 disabled:opacity-60"
                >
                  {savingClientInfo ? "Saving..." : "Save Client Info"}
                </button>
              )}
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

              {isAdmin && (
                <button
                  type="button"
                  onClick={generateClientActivationCode}
                  disabled={generatingActivationCode}
                  className="mt-5 rounded-2xl border border-yellow-400 px-5 py-3 text-sm font-semibold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black disabled:opacity-60"
                >
                  {generatingActivationCode
                    ? "Generating..."
                    : "Generate Activation Code"}
                </button>
              )}

              <p className="mt-3 text-xs text-gray-400">
                Activation Code:{" "}
                <span className="text-yellow-300">{activationCode || "-"}</span>
              </p>
            </section>
          </section>

          <section className="mb-6 grid gap-4 md:grid-cols-5">
            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-2xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Current Package Sessions
              </p>
              <p className="mt-3 text-4xl font-semibold text-yellow-400">
                {activePackageNumbers.totalSessions}
              </p>
            </div>

            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-2xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Used Sessions
              </p>
              <p className="mt-3 text-4xl font-semibold text-yellow-400">
                {activePackageNumbers.usedSessions}
              </p>
            </div>

            <div className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 text-center shadow-2xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Remaining
              </p>
              <p className="mt-3 text-4xl font-semibold text-yellow-400">
                {activePackageNumbers.remainingSessions}
              </p>
            </div>

            <div className="rounded-[2rem] border border-red-500/30 bg-red-500/10 p-5 text-center shadow-2xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-300">
                Active Debt
              </p>
              <p className="mt-3 text-4xl font-semibold text-red-300">
                {formatMoney(totalClientDebt)}
              </p>
            </div>

            <div className="rounded-[2rem] border border-green-500/30 bg-green-500/10 p-5 text-center shadow-2xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-300">
                Completed Debt
              </p>
              <p className="mt-3 text-4xl font-semibold text-green-300">
                {formatMoney(totalCompletedDebt)}
              </p>
            </div>
          </section>

          <section
            id="session-control-section"
            className="mb-6 rounded-[2rem] border border-cyan-400/40 bg-cyan-400/10 p-6 shadow-2xl backdrop-blur"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">
                  Session Control
                </p>

                <h2 className="mt-2 text-2xl font-semibold text-white">
                  Add / Subtract / Fix Sessions
                </h2>

                <p className="mt-2 text-sm font-normal leading-6 text-gray-300">
                  Use Add Sessions for renew corrections, Subtract Sessions for
                  manual deduction, and Fix Remaining Sessions when the number
                  is wrong and you need to set the exact remaining balance.
                </p>
              </div>

              <div className="rounded-2xl border border-cyan-400/25 bg-black/40 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Current
                </p>
                <p className="mt-1 text-sm font-semibold text-cyan-300">
                  Total {activePackageNumbers.totalSessions} / Used{" "}
                  {activePackageNumbers.usedSessions} / Left{" "}
                  {activePackageNumbers.remainingSessions}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_2fr]">
              <label>
                <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-cyan-300">
                  Session Number
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={sessionAdjustValue}
                  onChange={(event) =>
                    setSessionAdjustValue(event.target.value)
                  }
                  disabled={!allowPackageEdit}
                  placeholder="Example: 5"
                  className="w-full rounded-2xl border border-cyan-400/40 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none focus:border-cyan-300 disabled:opacity-70"
                />
              </label>

              {allowPackageEdit && (
                <div className="grid gap-3 md:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => adjustClientSessions("add")}
                    disabled={sessionAdjustAction !== null}
                    className="rounded-2xl bg-green-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-green-300 disabled:opacity-60"
                  >
                    {sessionAdjustAction === "add"
                      ? "Adding..."
                      : "Add Sessions"}
                  </button>

                  <button
                    type="button"
                    onClick={() => adjustClientSessions("subtract")}
                    disabled={sessionAdjustAction !== null}
                    className="rounded-2xl bg-red-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-red-300 disabled:opacity-60"
                  >
                    {sessionAdjustAction === "subtract"
                      ? "Subtracting..."
                      : "Subtract Sessions"}
                  </button>

                  <button
                    type="button"
                    onClick={() => adjustClientSessions("fix")}
                    disabled={sessionAdjustAction !== null}
                    className="rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-cyan-300 disabled:opacity-60"
                  >
                    {sessionAdjustAction === "fix"
                      ? "Fixing..."
                      : "Fix Remaining"}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-green-400/20 bg-green-400/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-green-300">
                  Add Sessions
                </p>
                <p className="mt-2 text-sm text-gray-300">
                  Adds to total and remaining. Used sessions stay the same.
                </p>
              </div>

              <div className="rounded-2xl border border-red-400/20 bg-red-400/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-red-300">
                  Subtract Sessions
                </p>
                <p className="mt-2 text-sm text-gray-300">
                  Reduces remaining and increases used sessions.
                </p>
              </div>

              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">
                  Fix Remaining
                </p>
                <p className="mt-2 text-sm text-gray-300">
                  Sets exact remaining. Total becomes used plus remaining.
                </p>
              </div>
            </div>
          </section>

          <section
            id="package-renew-section"
            className={`mb-6 rounded-[2rem] border p-6 shadow-2xl backdrop-blur ${
              renewPackageMode
                ? "border-green-400/60 bg-green-400/10"
                : "border-yellow-500/30 bg-white/[0.07]"
            }`}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                  Package Management
                </p>

                <h2 className="mt-2 text-2xl font-semibold">
                  Renew / Add Sessions
                </h2>

                <p className="mt-2 text-sm font-normal text-gray-400">
                  Renew package adds sessions on top of the client&apos;s
                  current remaining sessions. It keeps used sessions the same.
                </p>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setRenewPackageMode(true)}
                  className="rounded-xl bg-green-400 px-4 py-2 text-xs font-semibold uppercase text-black transition hover:bg-green-300"
                >
                  Renew Package
                </button>
              )}
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
              <form
                onSubmit={saveUploadedPurchaseType}
                className="rounded-3xl border border-yellow-400/25 bg-black/40 p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-yellow-300">
                  From Uploaded Data
                </p>

                <h3 className="mt-2 text-xl font-semibold text-white">
                  Save As New / Renew
                </h3>

                <p className="mt-2 text-sm font-normal text-gray-400">
                  Use this to mark the uploaded purchase record as New or Renew.
                  This does not add sessions.
                </p>

                <label className="mt-5 block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-yellow-300">
                    Uploaded Purchase Type
                  </span>

                  <select
                    value={uploadedPurchaseType}
                    onChange={(event) =>
                      setUploadedPurchaseType(event.target.value)
                    }
                    disabled={!allowPackageEdit}
                    className="w-full rounded-2xl border border-yellow-400 bg-white px-4 py-3 text-sm font-normal text-black outline-none focus:border-yellow-300 disabled:opacity-70"
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
                </label>

                {allowPackageEdit && (
                  <button
                    type="submit"
                    disabled={savingUploadedPurchaseType}
                    className="mt-5 rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-yellow-300 disabled:opacity-60"
                  >
                    {savingUploadedPurchaseType
                      ? "Saving..."
                      : "Save Uploaded Type"}
                  </button>
                )}
              </form>

              <form
                onSubmit={saveNewRenewPackage}
                className="rounded-3xl border border-green-400/25 bg-black/40 p-5"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-green-300">
                  Renew Package
                </p>

                <h3 className="mt-2 text-xl font-semibold text-white">
                  Add Sessions to Current Package
                </h3>

                <p className="mt-2 text-sm font-normal text-gray-400">
                  This adds sessions to the current package and records a renew
                  purchase.
                </p>

                <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <label>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                      Package Name
                    </span>
                    <input
                      value={packageName}
                      onChange={(event) => setPackageName(event.target.value)}
                      disabled={!allowPackageEdit}
                      className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400 disabled:opacity-70"
                      placeholder="Example: 10 Session Package"
                    />
                  </label>

                  <label>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-green-300">
                      Sessions to Add
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={packageTotalSessions}
                      onChange={(event) =>
                        setPackageTotalSessions(event.target.value)
                      }
                      disabled={!allowPackageEdit}
                      className="w-full rounded-2xl border border-green-400/50 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-green-300 disabled:opacity-70"
                      placeholder="Example: 10"
                    />
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
                      disabled={!allowPackageEdit}
                      className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400 disabled:opacity-70"
                    />
                  </label>

                  <label>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                      Amount Paid
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={packageAmountPaid}
                      onChange={(event) =>
                        setPackageAmountPaid(event.target.value)
                      }
                      disabled={!allowPackageEdit}
                      className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400 disabled:opacity-70"
                      placeholder="Leave blank if fully paid"
                    />
                  </label>

                  <label>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                      Start Date
                    </span>
                    <input
                      type="date"
                      value={packageStartDate}
                      onChange={(event) =>
                        setPackageStartDate(event.target.value)
                      }
                      disabled={!allowPackageEdit}
                      className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400 disabled:opacity-70"
                    />
                  </label>

                  <label>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                      Expire Date / Debt Deadline
                    </span>
                    <input
                      type="date"
                      value={packageExpireDate}
                      onChange={(event) =>
                        setPackageExpireDate(event.target.value)
                      }
                      disabled={!allowPackageEdit}
                      className="w-full rounded-2xl border border-yellow-500/30 bg-black/60 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400 disabled:opacity-70"
                    />
                  </label>
                </div>

                {allowPackageEdit && (
                  <button
                    type="submit"
                    disabled={savingPackage}
                    className="mt-5 rounded-2xl bg-green-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-green-300 disabled:opacity-60"
                  >
                    {savingPackage ? "Saving..." : "Add Renew Sessions"}
                  </button>
                )}
              </form>
            </div>
          </section>

          <section
            id="debt-section"
            className="mb-6 rounded-[2rem] border border-red-500/30 bg-red-500/10 p-6 shadow-2xl backdrop-blur"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-white">
                  Debt and Deadline
                </h2>

                <p className="mt-2 text-sm font-normal text-gray-300">
                  Add multiple debt records. Complete debt keeps the record on
                  this page and removes it from active debt.
                </p>
              </div>

              <span
                className={`w-fit rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-wide ${debtNotice.className}`}
              >
                {debtNotice.label}
              </span>
            </div>

            <form
              onSubmit={addDebtRecord}
              className="mt-5 rounded-3xl border border-red-400/30 bg-black/40 p-5"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-red-300">
                    Add New Debt
                  </p>

                  <h3 className="mt-1 text-xl font-semibold text-white">
                    Create Multiple Debt Records
                  </h3>

                  <p className="mt-2 text-sm font-normal text-gray-400">
                    This adds a new debt row without adding package gross value.
                  </p>
                </div>

                <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-300">
                    Total Active Debt
                  </p>
                  <p className="mt-1 text-xl font-semibold text-red-300">
                    {formatMoney(totalClientDebt)}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-4">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-300">
                    Debt Amount
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={newDebtAmount}
                    onChange={(event) => setNewDebtAmount(event.target.value)}
                    disabled={!allowDebtEdit}
                    placeholder="Example: 300"
                    className="w-full rounded-2xl border border-red-400/40 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400 disabled:opacity-70"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-300">
                    Deadline
                  </span>
                  <input
                    type="date"
                    value={newDebtDeadline}
                    onChange={(event) => setNewDebtDeadline(event.target.value)}
                    disabled={!allowDebtEdit}
                    className="w-full rounded-2xl border border-red-400/40 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400 disabled:opacity-70"
                  />
                </label>

                <label className="md:col-span-2">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-300">
                    Note / Debt Name
                  </span>
                  <input
                    value={newDebtNote}
                    onChange={(event) => setNewDebtNote(event.target.value)}
                    disabled={!allowDebtEdit}
                    placeholder="Example: Old package debt"
                    className="w-full rounded-2xl border border-red-400/40 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400 disabled:opacity-70"
                  />
                </label>
              </div>

              {allowDebtEdit && (
                <button
                  type="submit"
                  disabled={addingDebt}
                  className="mt-5 rounded-2xl bg-red-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-red-300 disabled:opacity-60"
                >
                  {addingDebt ? "Adding..." : "Add Debt"}
                </button>
              )}
            </form>

            <div className="mt-5 rounded-3xl border border-red-400/30 bg-black/45 p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Active Debt Records
                  </h3>

                  <p className="mt-1 text-sm text-gray-400">
                    Use <span className="text-green-300">Record Payment</span>{" "}
                    only when the client actually pays debt. This reduces debt
                    and adds income to the Revenue page.
                  </p>
                </div>

                <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-300">
                    Total Active Debt
                  </p>
                  <p className="mt-1 text-xl font-semibold text-red-300">
                    {formatMoney(totalClientDebt)}
                  </p>
                </div>
              </div>

              {activeDebtPurchases.length === 0 ? (
                <p className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-gray-400">
                  No active debt records.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {activeDebtPurchases.map((purchase) => {
                    const currentBalance = Number(purchase.balance_due || 0);
                    const paymentAmountValue =
                      debtPaymentAmounts[purchase.id] ?? String(currentBalance);
                    const paymentDateValue =
                      debtPaymentDates[purchase.id] || getTodayInputDate();

                    return (
                      <div
                        key={purchase.id}
                        className="rounded-3xl border border-red-400/25 bg-red-400/10 p-5"
                      >
                        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-widest text-red-300">
                              Debt Record
                            </p>

                            <h4 className="mt-2 text-xl font-semibold text-white">
                              {purchase.plan_name || "Manual Debt"}
                            </h4>

                            <p className="mt-2 text-xs text-gray-400">
                              Added {formatDate(purchase.created_at)}
                            </p>

                            <p className="mt-2 text-sm text-gray-300">
                              Deadline:{" "}
                              <span className="text-yellow-300">
                                {formatDate(purchase.debt_deadline)}
                              </span>
                            </p>
                          </div>

                          <div className="rounded-2xl border border-red-400/20 bg-black/40 p-4">
                            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                              Current Debt
                            </p>
                            <p className="mt-2 text-3xl font-semibold text-red-300">
                              {formatMoney(currentBalance)}
                            </p>
                          </div>

                          <div className="rounded-2xl border border-green-400/20 bg-green-400/10 p-4">
                            <p className="text-xs font-semibold uppercase tracking-widest text-gray-300">
                              Paid So Far
                            </p>
                            <p className="mt-2 text-3xl font-semibold text-green-300">
                              {formatMoney(purchase.amount_paid)}
                            </p>
                          </div>
                        </div>

                        {allowDebtEdit && (
                          <div className="mt-5 rounded-3xl border border-green-400/25 bg-black/45 p-5">
                            <p className="text-xs font-semibold uppercase tracking-widest text-green-300">
                              Record Debt Payment
                            </p>

                            <p className="mt-2 text-sm leading-6 text-gray-400">
                              This is for money actually received from the
                              client. It will add an income transaction to
                              Revenue with source{" "}
                              <span className="text-green-300">
                                Debt Payment
                              </span>
                              .
                            </p>

                            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
                              <label>
                                <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-300">
                                  Payment Amount
                                </span>
                                <input
                                  type="number"
                                  min="0"
                                  max={currentBalance}
                                  step="0.01"
                                  value={paymentAmountValue}
                                  onChange={(event) =>
                                    setDebtPaymentAmounts((current) => ({
                                      ...current,
                                      [purchase.id]: event.target.value,
                                    }))
                                  }
                                  className="w-full rounded-2xl border border-green-400/35 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none focus:border-green-300"
                                />
                              </label>

                              <label>
                                <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-300">
                                  Payment Date
                                </span>
                                <input
                                  type="date"
                                  value={paymentDateValue}
                                  onChange={(event) =>
                                    setDebtPaymentDates((current) => ({
                                      ...current,
                                      [purchase.id]: event.target.value,
                                    }))
                                  }
                                  className="w-full rounded-2xl border border-green-400/35 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none focus:border-green-300"
                                />
                              </label>

                              <div className="flex items-end">
                                <button
                                  type="button"
                                  onClick={() => completeDebtRecord(purchase)}
                                  disabled={completingDebtId === purchase.id}
                                  className="w-full rounded-2xl bg-green-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-green-300 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
                                >
                                  {completingDebtId === purchase.id
                                    ? "Recording..."
                                    : "Record Payment"}
                                </button>
                              </div>
                            </div>

                            <div className="mt-4 rounded-2xl border border-yellow-400/25 bg-yellow-400/10 p-4">
                              <p className="text-xs font-semibold uppercase tracking-widest text-yellow-300">
                                Important
                              </p>
                              <p className="mt-2 text-sm leading-6 text-yellow-100/80">
                                Do not use this to correct wrong debt numbers.
                                Use the correction section below for that. This
                                button means real money was collected and must
                                appear in Revenue.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-5 rounded-3xl border border-green-400/20 bg-green-400/10 p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <h3 className="text-lg font-semibold text-white">
                  Completed Debt Records
                </h3>

                <p className="text-sm font-semibold text-green-300">
                  Total Completed: {formatMoney(totalCompletedDebt)}
                </p>
              </div>

              {completedDebtPurchases.length === 0 ? (
                <p className="mt-3 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-gray-400">
                  No completed debt records yet.
                </p>
              ) : (
                <div className="mt-4 space-y-2">
                  {completedDebtPurchases.map((purchase) => (
                    <div
                      key={purchase.id}
                      className="grid gap-3 rounded-2xl border border-green-400/20 bg-black/35 p-4 md:grid-cols-[1fr_auto_auto]"
                    >
                      <div>
                        <p className="font-semibold text-white">
                          {purchase.plan_name || "Completed Debt"}
                        </p>
                        <p className="mt-1 text-xs text-gray-400">
                          Original deadline {formatDate(purchase.debt_deadline)}
                        </p>
                      </div>

                      <div className="text-left md:text-right">
                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                          Paid Amount
                        </p>
                        <p className="mt-1 text-lg font-semibold text-green-300">
                          {formatMoney(purchase.amount_paid)}
                        </p>
                      </div>

                      <div className="text-left md:text-right">
                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                          Balance
                        </p>
                        <p className="mt-1 text-sm font-semibold text-green-300">
                          Complete
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <form onSubmit={saveDebtDetails} className="mt-5">
              <div className="mb-4 rounded-2xl border border-cyan-400/25 bg-cyan-400/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">
                  Debt Fix + Revenue Option
                </p>

                <p className="mt-2 text-sm leading-6 text-gray-300">
                  Lowering the debt amount can be treated as a debt payment and
                  added to Revenue. Increasing the debt amount only updates the
                  debt balance and does not add income.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-300">
                    Edit Debt Amount
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={debtAmount}
                    onChange={(event) => setDebtAmount(event.target.value)}
                    disabled={!allowDebtEdit}
                    placeholder="0"
                    className="w-full rounded-2xl border border-red-400/40 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400 disabled:opacity-70"
                  />
                </label>

                <label>
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-300">
                    Edit Debt Deadline
                  </span>
                  <input
                    type="date"
                    value={debtDeadline}
                    onChange={(event) => setDebtDeadline(event.target.value)}
                    disabled={!allowDebtEdit}
                    className="w-full rounded-2xl border border-red-400/40 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400 disabled:opacity-70"
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

              {allowDebtEdit && (
                <div className="mt-5 rounded-3xl border border-yellow-400/25 bg-yellow-400/10 p-5">
                  <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr_0.9fr]">
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/40 p-4">
                      <input
                        type="checkbox"
                        checked={debtFixAddsRevenue}
                        onChange={(event) =>
                          setDebtFixAddsRevenue(event.target.checked)
                        }
                        className="mt-1 h-4 w-4 accent-yellow-400"
                      />

                      <span>
                        <span className="block text-xs font-semibold uppercase tracking-widest text-yellow-300">
                          Add Debt Reduction to Revenue
                        </span>
                        <span className="mt-2 block text-sm leading-6 text-gray-300">
                          When the new debt amount is lower than the current
                          debt, the difference will be recorded as income.
                        </span>
                      </span>
                    </label>

                    <label>
                      <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-300">
                        Revenue Date
                      </span>
                      <input
                        type="date"
                        value={debtFixRevenueDate}
                        onChange={(event) =>
                          setDebtFixRevenueDate(event.target.value)
                        }
                        disabled={!debtFixAddsRevenue}
                        className="w-full rounded-2xl border border-yellow-400/35 bg-black/70 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400 disabled:opacity-50"
                      />
                    </label>

                    <div className="rounded-2xl border border-green-400/25 bg-green-400/10 p-4">
                      <p className="text-xs font-semibold uppercase tracking-widest text-green-300">
                        Revenue Preview
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-green-300">
                        {formatMoney(
                          debtFixWillAddRevenue ? debtFixRevenueAmount : 0,
                        )}
                      </p>
                      <p className="mt-2 text-xs text-gray-400">
                        Old debt {formatMoney(currentDebtBalanceForFix)} → new
                        debt{" "}
                        {formatMoney(
                          Number.isNaN(nextDebtBalanceForFix)
                            ? 0
                            : nextDebtBalanceForFix,
                        )}
                      </p>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={savingDebt}
                    className="mt-5 rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold uppercase text-black transition hover:bg-yellow-300 disabled:opacity-60"
                  >
                    {savingDebt
                      ? "Saving..."
                      : debtFixWillAddRevenue
                        ? "Save Debt + Add Revenue"
                        : "Save Debt Fix"}
                  </button>
                </div>
              )}
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
                  Sessions
                </p>
                <p className="mt-2 font-normal text-cyan-300">
                  {latestPurchase?.session_count ?? "-"}
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
