import Link from "next/link";

export default function ClientBookPage() {
  return (
    <main className="min-h-screen bg-black px-4 py-8 text-white">
      <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center">
        <section className="w-full rounded-[2rem] border border-yellow-400/30 bg-white/[0.06] p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-yellow-400 text-4xl">
            🛠️
          </div>

          <p className="mt-6 text-xs font-bold uppercase tracking-[0.35em] text-yellow-400">
            FXA FITNESS
          </p>

          <h1 className="mt-4 text-3xl font-black text-white">
            Booking Feature Update
          </h1>

          <p className="mt-4 text-base leading-7 text-gray-300">
            This feature is being updated and will be available soon.
          </p>

          <p className="mt-2 text-sm leading-6 text-gray-500">
            Please contact the FXA FITNESS team directly to book your session for
            now.
          </p>

          <Link
            href="/client"
            className="mt-8 inline-block rounded-2xl bg-yellow-400 px-6 py-3 text-sm font-black uppercase tracking-wide text-black transition hover:bg-yellow-300"
          >
            Back to Client Portal
          </Link>
        </section>
      </div>
    </main>
  );
}