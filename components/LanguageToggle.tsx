"use client";

import { useEffect, useState } from "react";

type Language = "vi" | "en";

function applyLanguage(language: Language) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;
  document.documentElement.dataset.language = language;
}

export default function LanguageToggle() {
  const [language, setLanguage] = useState<Language>("vi");

  useEffect(() => {
    const stored = window.localStorage.getItem("fxa-language") as Language | null;
    const next = stored === "en" || stored === "vi" ? stored : "vi";
    setLanguage(next);
    applyLanguage(next);
  }, []);

  function choose(next: Language) {
    setLanguage(next);
    window.localStorage.setItem("fxa-language", next);
    applyLanguage(next);
    window.dispatchEvent(new CustomEvent("fxa-language-change", { detail: next }));
  }

  return (
    <div className="fixed bottom-20 right-4 z-[90] flex rounded-full border border-yellow-400/25 bg-black/85 p-1 text-[11px] font-black uppercase tracking-[0.12em] shadow-2xl shadow-black/50 backdrop-blur md:bottom-4">
      <button
        type="button"
        onClick={() => choose("vi")}
        className={`rounded-full px-3 py-2 transition ${
          language === "vi"
            ? "bg-yellow-400 text-black"
            : "text-zinc-300 hover:text-yellow-300"
        }`}
        aria-pressed={language === "vi"}
        aria-label="Use Vietnamese"
      >
        VI
      </button>
      <button
        type="button"
        onClick={() => choose("en")}
        className={`rounded-full px-3 py-2 transition ${
          language === "en"
            ? "bg-yellow-400 text-black"
            : "text-zinc-300 hover:text-yellow-300"
        }`}
        aria-pressed={language === "en"}
        aria-label="Use English"
      >
        EN
      </button>
    </div>
  );
}
