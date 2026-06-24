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
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState("");

  const manualSlot = useMemo(() => {
    return buildManualSlot(manualDate, manualTime);
  }, [manualDate, manualTime]);

  const selectedBookingSlot = selectedSlot || manualSlot;

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
          "Client profile was not found. Please check that this client row has profile_id linked to the logged-in user."
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
        availability?: AvailabilitySlot[];
        slots?: AvailabilitySlot[];
        error?: string;
      }>(response, "Empty response from availability API.");

      if (!response.ok) {
        throw new Error(result.error || "Could not load availability.");
      }

      const slots = result.availability || result.slots || [];
      setAvailability(slots);

      if (slots.length === 0) {
        setMessage(
          result.error ||
            "No Google Calendar times were found. You can still choose a manual date and time below."
        );
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
      <main className="min-h-screen bg-black p-5 text-white">
        <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-6">
          <p className="text-base font-black text-yellow-400">
            Checking booking access...
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black p-4 text-white md:p-6">
      <div className="min-h-screen rounded-[2rem] bg-[radial-gradient(circle_at_top_left,_rgba(250,180,20,0.18),_transparent_35%),linear-gradient(135deg,_#050505,_#111111_45%,_#050505)] p-4 md:p-8">
        <div className="mx-auto max-w-4xl">
          <header className="mb-8">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.45em] text-yellow-400">
              FXA FITNESS
            </p>

            <h1 className="text-4xl font-black tracking-tight md:text-6xl">
              Book Session
            </h1>

            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-gray-400 md:text-base">
              Choose a trainer or nutrition coach, check available times, or
              manually request a session time.
            </p>
          </header>

          {message ? (
            <div className="mb-6 rounded-2xl border border-yellow-500/30 bg-yellow-400/10 p-4 text-sm font-bold text-yellow-300">
              {message}
            </div>
          ) : null}

          <section className="rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-7">
            <h2 className="text-2xl font-black">Choose Staff</h2>

            {loadingStaff ? (
              <p className="mt-4 font-bold text-yellow-400">
                Loading staff...
              </p>
            ) : staffMembers.length === 0 ? (
              <p className="mt-4 font-bold text-gray-400">
                No trainers or nutrition coaches were found.
              </p>
            ) : (
              <>
                <select
                  value={selectedStaffId}
                  onChange={(event) => {
                    setSelectedStaffId(event.target.value);
                    setAvailability([]);
                    setSelectedSlot(null);
                  }}
                  className="mt-5 w-full rounded-2xl border border-yellow-500/30 bg-black/70 px-4 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
                >
                  {staffMembers.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.full_name || staff.email || "Staff"} -{" "}
                      {getRoleLabel(staff.role)}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={loadAvailability}
                  disabled={loadingAvailability}
                  className="mt-5 w-full rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingAvailability ? "Loading Times..." : "Check Times"}
                </button>
              </>
            )}
          </section>

          <section className="mt-6 rounded-[2rem] border border-yellow-500/30 bg-white/[0.07] p-5 shadow-2xl backdrop-blur md:p-7">
            <h2 className="text-2xl font-black">Available Times</h2>

            {availability.length === 0 ? (
              <p className="mt-4 text-sm font-medium text-gray-400">
                No automatic Google Calendar times are selected. Choose a manual
                time below.
              </p>
            ) : (
              <div className="mt-5 grid gap-3 md:grid-cols-2">
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
                          : "border-yellow-500/30 bg-black/60 text-white hover:border-yellow-400"
                      }`}
                    >
                      <p className="text-sm font-black">
                        {formatDateTime(slot.starts_at)}
                      </p>
                      <p
                        className={`mt-1 text-xs font-bold ${
                          isSelected ? "text-black/70" : "text-gray-400"
                        }`}
                      >
                        Ends: {formatDateTime(slot.ends_at)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-6 rounded-3xl border border-yellow-400/20 bg-black/60 p-4">
              <h3 className="text-lg font-black text-yellow-400">
                Manual Time
              </h3>

              <p className="mt-2 text-sm font-medium leading-6 text-gray-400">
                Use this if automatic availability is empty. This books a
                1-hour session.
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-black uppercase tracking-widest text-gray-400">
                    Date
                  </span>
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(event) => {
                      setManualDate(event.target.value);
                      setSelectedSlot(null);
                    }}
                    className="mt-2 w-full rounded-2xl border border-yellow-500/30 bg-black/70 px-4 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-black uppercase tracking-widest text-gray-400">
                    Time
                  </span>
                  <input
                    type="time"
                    value={manualTime}
                    onChange={(event) => {
                      setManualTime(event.target.value);
                      setSelectedSlot(null);
                    }}
                    className="mt-2 w-full rounded-2xl border border-yellow-500/30 bg-black/70 px-4 py-3 text-sm font-bold text-white outline-none focus:border-yellow-400"
                  />
                </label>
              </div>

              {manualSlot && !selectedSlot ? (
                <p className="mt-4 rounded-2xl border border-yellow-500/30 bg-yellow-400/10 p-3 text-sm font-bold text-yellow-300">
                  Selected manual time: {formatDateTime(manualSlot.starts_at)}
                </p>
              ) : null}
            </div>

            <button
              type="button"
              onClick={createBooking}
              disabled={booking || !selectedBookingSlot}
              className="mt-6 w-full rounded-2xl bg-yellow-400 px-5 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {booking ? "Booking..." : "Book Selected Session"}
            </button>
          </section>

          <div className="mt-6">
            <Link
              href="/client"
              className="block rounded-2xl border border-yellow-400 px-5 py-3 text-center text-sm font-black uppercase tracking-wide text-yellow-400 transition hover:bg-yellow-400 hover:text-black"
            >
              Back to Client Dashboard
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}