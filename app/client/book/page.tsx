"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { getCurrentUserRole } from "../../../lib/checkUserRole";

type StaffMember = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  google_email?: string | null;
};

type AvailabilitySlot = {
  starts_at: string;
  ends_at: string;
};

type ClientProfile = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
};

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-CA", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getRoleLabel(role: string) {
  if (role === "nutrition_coach") return "Nutrition Coach";
  if (role === "trainer") return "Trainer";
  if (role === "admin") return "Admin";
  return "Staff";
}

function getDefaultManualDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);

  return date.toISOString().slice(0, 10);
}

function buildManualSlot(dateValue: string, timeValue: string) {
  if (!dateValue || !timeValue) return null;

  const startDate = new Date(`${dateValue}T${timeValue}:00`);

  if (Number.isNaN(startDate.getTime())) return null;

  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

  return {
    starts_at: startDate.toISOString(),
    ends_at: endDate.toISOString(),
  };
}

async function readJsonResponse<T>(
  response: Response,
  emptyMessage: string
): Promise<T> {
  const text = await response.text();

  if (!text) {
    return { error: emptyMessage } as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: "Server returned an invalid response." } as T;
  }
}

function normalizeAvailabilitySlots(
  rawSlots: Partial<AvailabilitySlot>[]
): AvailabilitySlot[] {
  return rawSlots
    .map((slot) => ({
      starts_at: String(slot.starts_at || ""),
      ends_at: String(slot.ends_at || ""),
    }))
    .filter((slot) => Boolean(slot.starts_at) && Boolean(slot.ends_at));
}

export default function ClientBookPage() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] = useState(true);
  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(
    null
  );

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(
    null
  );

  const [manualDate, setManualDate] = useState(getDefaultManualDate());
  const [manualTime, setManualTime] = useState("09:00");

  const [loadingStaff, setLoadingStaff] = useState(false);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [hasCheckedAvailability, setHasCheckedAvailability] = useState(false);
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState("");

  const manualSlot = useMemo(() => {
    return buildManualSlot(manualDate, manualTime);
  }, [manualDate, manualTime]);

  const selectedBookingSlot = selectedSlot || manualSlot;

  const selectedStaff = staffMembers.find(
    (staff) => staff.id === selectedStaffId
  );

  useEffect(() => {
    async function protectPage() {
      const { user, role } = await getCurrentUserRole();

      if (!user) {
        router.push("/client/login");
        return;
      }

      if (role === "admin" || role === "trainer" || role === "nutrition_coach") {
        router.push("/trainer/scan");
        return;
      }

      if (role !== "client") {
        await supabase.auth.signOut();
        router.push("/client/login");
        return;
      }

      const { data: clientData, error: clientError } = await supabase
        .from("clients")
        .select("id, full_name, email, phone")
        .eq("profile_id", user.id)
        .maybeSingle();

      if (clientError) {
        setMessage(clientError.message);
        setCheckingRole(false);
        return;
      }

      if (!clientData) {
        setMessage(
          "Client profile was not found. Please ask FXA FITNESS staff to connect your login to your client profile."
        );
        setCheckingRole(false);
        return;
      }

      setClientProfile(clientData as ClientProfile);
      setCheckingRole(false);
    }

    protectPage();
  }, [router]);

  useEffect(() => {
    async function loadStaff() {
      if (checkingRole) return;

      setLoadingStaff(true);
      setMessage("");

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token) {
          router.push("/client/login");
          return;
        }

        const response = await fetch("/api/bookings/staff", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const result = await readJsonResponse<{
          staff?: StaffMember[];
          error?: string;
        }>(response, "Empty response from staff API.");

        if (!response.ok) {
          throw new Error(result.error || "Could not load staff.");
        }

        const staff = result.staff || [];
        setStaffMembers(staff);

        if (staff.length > 0) {
          setSelectedStaffId(staff[0].id);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Could not load staff.";
        setMessage(errorMessage);
      } finally {
        setLoadingStaff(false);
      }
    }

    loadStaff();
  }, [checkingRole, router]);

  async function loadAvailability() {
    if (!selectedStaffId) {
      setMessage("Please choose a trainer or nutrition coach.");
      return;
    }

    setLoadingAvailability(true);
    setHasCheckedAvailability(true);
    setAvailability([]);
    setSelectedSlot(null);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.push("/client/login");
        return;
      }

      const response = await fetch(
        `/api/bookings/availability?trainerId=${encodeURIComponent(
          selectedStaffId
        )}`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const result = await readJsonResponse<{
        availability?: Partial<AvailabilitySlot>[];
        slots?: Partial<AvailabilitySlot>[];
        freeSlots?: Partial<AvailabilitySlot>[];
        data?: Partial<AvailabilitySlot>[];
        error?: string;
      }>(response, "Empty response from availability API.");

      if (!response.ok) {
        throw new Error(result.error || "Could not load availability.");
      }

      const rawSlots =
        result.availability || result.slots || result.freeSlots || result.data || [];

      const cleanSlots = normalizeAvailabilitySlots(rawSlots);

      setAvailability(cleanSlots);

      if (cleanSlots.length === 0) {
        setMessage(
          "No automatic calendar times were found. You can still choose a manual date and time below."
        );
      } else {
        setMessage("");
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Could not load availability.";

      setMessage(
        `${errorMessage} You can still choose a manual date and time below.`
      );
    } finally {
      setLoadingAvailability(false);
    }
  }

  async function createBooking() {
    if (!clientProfile) {
      setMessage(
        "Client profile was not loaded. Please go back to the client dashboard and open Book Session again."
      );
      return;
    }

    if (!selectedStaffId) {
      setMessage("Please choose a trainer or nutrition coach.");
      return;
    }

    if (!selectedBookingSlot) {
      setMessage("Please choose a date and time.");
      return;
    }

    setBooking(true);
    setMessage("");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        router.push("/client/login");
        return;
      }

      const response = await fetch("/api/bookings/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          client_id: clientProfile.id,
          trainer_id: selectedStaffId,
          client_name: clientProfile.full_name,
          client_email: clientProfile.email,
          client_phone: clientProfile.phone,
          starts_at: selectedBookingSlot.starts_at,
          ends_at: selectedBookingSlot.ends_at,

          clientId: clientProfile.id,
          trainerId: selectedStaffId,
          clientName: clientProfile.full_name,
          clientEmail: clientProfile.email,
          clientPhone: clientProfile.phone,
          startsAt: selectedBookingSlot.starts_at,
          endsAt: selectedBookingSlot.ends_at,
        }),
      });

      const result = await readJsonResponse<{ error?: string }>(
        response,
        "Empty response from booking API."
      );

      if (!response.ok) {
        throw new Error(result.error || "Could not book session.");
      }

      setMessage("Session booked successfully.");
      setSelectedSlot(null);
      setAvailability([]);
      setHasCheckedAvailability(false);
      setManualDate(getDefaultManualDate());
      setManualTime("09:00");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Could not book session.";
      setMessage(errorMessage);
    } finally {
      setBooking(false);
    }
  }

  if (checkingRole) {
    return (
      <main className="min-h-screen bg-black p-4 text-white md:p-6">
        <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="text-sm font-semibold text-yellow-400">
            Checking booking access...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="fxa-scrollbar min-h-screen overflow-y-auto bg-black p-3 text-white md:p-5">
      <style jsx global>{`
        html,
        body {
          scrollbar-width: thin;
          scrollbar-color: #facc15 #111111;
        }

        ::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }

        ::-webkit-scrollbar-track {
          background: #111111;
          border-radius: 999px;
        }

        ::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #facc15, #ca8a04);
          border: 3px solid #111111;
          border-radius: 999px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #fde047, #facc15);
        }

        .fxa-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #facc15 #111111;
        }

        .fxa-scrollbar::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }

        .fxa-scrollbar::-webkit-scrollbar-track {
          background: #111111;
          border-radius: 999px;
        }

        .fxa-scrollbar::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #facc15, #ca8a04);
          border: 3px solid #111111;
          border-radius: 999px;
        }

        .fxa-scrollbar::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #fde047, #facc15);
        }

        select {
          scrollbar-width: thin;
          scrollbar-color: #facc15 #111111;
        }
      `}</style>

      <div className="min-h-screen rounded-3xl bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.16),_transparent_30%),linear-gradient(135deg,_#050505,_#101010_45%,_#050505)] p-4 md:p-6">
        <div className="mx-auto max-w-5xl">
          <header className="mb-5 rounded-3xl border border-yellow-500/25 bg-black/50 p-5 shadow-2xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-[0.28em] text-yellow-400">
                  FXA FITNESS
                </p>

                <h1 className="text-3xl font-semibold md:text-5xl">
                  Book Your Session
                </h1>

                <p className="mt-2 max-w-2xl text-sm font-normal leading-6 text-gray-400">
                  Choose your coach, pick an available time, or request a manual
                  1-hour session time.
                </p>
              </div>

              <Link
                href="/client"
                className="rounded-xl border border-yellow-400 px-4 py-2 text-center text-xs font-semibold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
              >
                Back to Dashboard
              </Link>
            </div>
          </header>

          {clientProfile ? (
            <section className="mb-5 rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-5 shadow-2xl backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                Booking For
              </p>

              <h2 className="mt-2 text-2xl font-semibold text-yellow-400">
                {clientProfile.full_name}
              </h2>

              <p className="mt-2 text-sm font-normal text-gray-300">
                {clientProfile.email || "-"}{" "}
                {clientProfile.phone ? `| ${clientProfile.phone}` : ""}
              </p>
            </section>
          ) : null}

          {message ? (
            <div className="mb-5 rounded-2xl border border-yellow-500/30 bg-yellow-400/10 p-4 text-sm font-normal leading-6 text-yellow-100">
              {message}
            </div>
          ) : null}

          <section className="mb-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-3xl border border-yellow-400/40 bg-yellow-400 p-5 text-black shadow-2xl">
              <p className="text-3xl">1</p>

              <h2 className="mt-3 text-xl font-semibold uppercase">
                Choose Coach
              </h2>

              <p className="mt-2 text-sm font-normal leading-6 text-black/70">
                Pick a trainer or nutrition coach from the list.
              </p>
            </div>

            <div className="rounded-3xl border border-yellow-500/30 bg-white/[0.06] p-5 shadow-2xl backdrop-blur">
              <p className="text-3xl text-yellow-400">2</p>

              <h2 className="mt-3 text-xl font-semibold uppercase text-white">
                Check Times
              </h2>

              <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                See available calendar slots or use manual time.
              </p>
            </div>

            <div className="rounded-3xl border border-green-500/30 bg-green-500/10 p-5 shadow-2xl backdrop-blur">
              <p className="text-3xl text-green-300">3</p>

              <h2 className="mt-3 text-xl font-semibold uppercase text-white">
                Confirm
              </h2>

              <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                Review your selected time and submit booking.
              </p>
            </div>
          </section>

          <section className="rounded-3xl border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                  Step 1
                </p>

                <h2 className="mt-1 text-2xl font-semibold text-white">
                  Choose Staff
                </h2>

                <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                  Select who you want to book with, then check their available times.
                </p>
              </div>

              {selectedStaff ? (
                <span className="w-fit rounded-full border border-yellow-400/30 bg-yellow-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-yellow-300">
                  {getRoleLabel(selectedStaff.role)}
                </span>
              ) : null}
            </div>

            {loadingStaff ? (
              <p className="mt-4 text-sm font-semibold text-yellow-400">
                Loading staff...
              </p>
            ) : staffMembers.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm font-normal text-gray-400">
                No trainers or nutrition coaches were found.
              </p>
            ) : (
              <>
                <label className="mt-5 block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Trainer / Nutrition Coach
                  </span>

                  <select
                    value={selectedStaffId}
                    onChange={(event) => {
                      setSelectedStaffId(event.target.value);
                      setAvailability([]);
                      setSelectedSlot(null);
                      setHasCheckedAvailability(false);
                      setMessage("");
                    }}
                    className="fxa-scrollbar w-full rounded-2xl border border-yellow-500/30 bg-black/80 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                  >
                    {staffMembers.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {staff.full_name || staff.email || "Staff"} -{" "}
                        {getRoleLabel(staff.role)}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  onClick={loadAvailability}
                  disabled={loadingAvailability}
                  className="mt-5 w-full rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingAvailability
                    ? "Loading Times..."
                    : "Check Available Times"}
                </button>
              </>
            )}
          </section>

          <section className="mt-5 rounded-3xl border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-yellow-400">
                Step 2
              </p>

              <h2 className="mt-1 text-2xl font-semibold text-white">
                Choose Time
              </h2>

              <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                Press Check Available Times first. If automatic times appear,
                choose one. If not, use manual time below.
              </p>
            </div>

            {loadingAvailability ? (
              <div className="mt-5 rounded-2xl border border-yellow-500/30 bg-black/45 p-5">
                <p className="text-sm font-semibold text-yellow-400">
                  Loading available times...
                </p>
              </div>
            ) : availability.length > 0 ? (
              <div className="mt-5">
                <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm font-normal text-gray-300">
                    Found{" "}
                    <span className="font-semibold text-yellow-400">
                      {availability.length}
                    </span>{" "}
                    available time{availability.length === 1 ? "" : "s"}.
                  </p>

                  <button
                    type="button"
                    onClick={loadAvailability}
                    className="w-fit rounded-xl border border-yellow-400 px-4 py-2 text-xs font-semibold uppercase text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
                  >
                    Refresh Times
                  </button>
                </div>

                <div className="fxa-scrollbar max-h-[420px] overflow-y-auto rounded-2xl border border-yellow-500/25 bg-black/35 p-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    {availability.map((slot) => {
                      const isSelected =
                        selectedSlot?.starts_at === slot.starts_at &&
                        selectedSlot?.ends_at === slot.ends_at;

                      return (
                        <button
                          key={`${slot.starts_at}-${slot.ends_at}`}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`rounded-2xl border p-4 text-left transition ${
                            isSelected
                              ? "border-yellow-400 bg-yellow-400 text-black"
                              : "border-yellow-500/30 bg-black/70 text-white hover:border-yellow-400 hover:bg-black/90"
                          }`}
                        >
                          <p className="text-sm font-semibold">
                            {formatDateTime(slot.starts_at)}
                          </p>

                          <p
                            className={`mt-1 text-xs font-normal ${
                              isSelected ? "text-black/70" : "text-gray-400"
                            }`}
                          >
                            Ends: {formatDateTime(slot.ends_at)}
                          </p>

                          {isSelected ? (
                            <p className="mt-3 rounded-xl bg-black/10 px-3 py-2 text-xs font-semibold uppercase text-black">
                              Selected
                            </p>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : hasCheckedAvailability ? (
              <div className="mt-5 rounded-2xl border border-orange-400/30 bg-orange-400/10 p-5">
                <h3 className="text-lg font-semibold text-orange-300">
                  No automatic times found
                </h3>

                <p className="mt-2 text-sm font-normal leading-6 text-gray-300">
                  You can still request a session by choosing a manual date and
                  time below.
                </p>
              </div>
            ) : (
              <div className="mt-5 rounded-2xl border border-yellow-500/30 bg-black/45 p-5">
                <h3 className="text-lg font-semibold text-white">
                  Check available times
                </h3>

                <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                  Choose your staff member, then press Check Available Times
                  above.
                </p>
              </div>
            )}

            <div className="mt-5 rounded-3xl border border-yellow-400/20 bg-black/60 p-5">
              <h3 className="text-xl font-semibold text-yellow-400">
                Manual Time
              </h3>

              <p className="mt-2 text-sm font-normal leading-6 text-gray-400">
                Use this if automatic availability is empty. This books a 1-hour
                session request.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Date
                  </span>

                  <input
                    type="date"
                    value={manualDate}
                    onChange={(event) => {
                      setManualDate(event.target.value);
                      setSelectedSlot(null);
                    }}
                    className="mt-2 w-full rounded-2xl border border-yellow-500/30 bg-black/80 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Time
                  </span>

                  <input
                    type="time"
                    value={manualTime}
                    onChange={(event) => {
                      setManualTime(event.target.value);
                      setSelectedSlot(null);
                    }}
                    className="mt-2 w-full rounded-2xl border border-yellow-500/30 bg-black/80 px-4 py-3 text-sm font-normal text-white outline-none focus:border-yellow-400"
                  />
                </label>
              </div>

              {manualSlot && !selectedSlot ? (
                <p className="mt-4 rounded-2xl border border-yellow-500/30 bg-yellow-400/10 p-3 text-sm font-normal text-yellow-100">
                  Selected manual time:{" "}
                  <span className="font-semibold text-yellow-300">
                    {formatDateTime(manualSlot.starts_at)}
                  </span>
                </p>
              ) : null}

              {selectedSlot ? (
                <p className="mt-4 rounded-2xl border border-green-500/30 bg-green-500/10 p-3 text-sm font-normal text-green-200">
                  Selected automatic time:{" "}
                  <span className="font-semibold text-green-300">
                    {formatDateTime(selectedSlot.starts_at)}
                  </span>
                </p>
              ) : null}
            </div>
          </section>

          <section className="mt-5 rounded-3xl border border-green-500/30 bg-green-500/10 p-5 shadow-2xl backdrop-blur md:p-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-green-300">
              Step 3
            </p>

            <h2 className="mt-1 text-2xl font-semibold text-white">
              Confirm Booking
            </h2>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Staff
                </p>

                <p className="mt-2 text-sm font-normal text-white">
                  {selectedStaff
                    ? `${selectedStaff.full_name || selectedStaff.email || "Staff"} - ${getRoleLabel(
                        selectedStaff.role
                      )}`
                    : "No staff selected"}
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Selected Time
                </p>

                <p className="mt-2 text-sm font-normal text-white">
                  {selectedBookingSlot
                    ? formatDateTime(selectedBookingSlot.starts_at)
                    : "No time selected"}
                </p>

                <p className="mt-1 text-xs font-normal text-gray-400">
                  {selectedSlot ? "Automatic calendar time" : "Manual time"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={createBooking}
              disabled={booking || !selectedBookingSlot}
              className="mt-5 w-full rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-semibold uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {booking ? "Booking..." : "Book Selected Session"}
            </button>
          </section>

          <div className="mt-5">
            <Link
              href="/client"
              className="block rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-semibold uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
            >
              Back to Client Dashboard
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}