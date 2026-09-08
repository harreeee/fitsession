"use client";

import { useEffect, useState } from "react";

type Language = "vi" | "en";

const VI_TO_EN: Record<string, string> = {
  "CẦN FOLLOW": "NEED FOLLOW",
  "ĐANG XỬ LÝ": "IN PROGRESS",
  "ĐANG CHỜ": "WAITING",
  "ĐÃ FOLLOW": "FOLLOWED",
  "CHƯA PHÂN LOẠI": "UNREVIEWED",
  "Tất cả khách": "All Clients",
  "Đã Follow": "Followed",
  "Không cần Follow": "No Follow Needed",
  "Tìm khách hàng...": "Search clients...",
  "Khách hàng": "Client",
  "Không có khách phù hợp bộ lọc.": "No clients match these filters.",
  "Overdue + P1/P2 được đưa lên đầu": "Overdue + P1/P2 are shown first",
  "Toàn bộ khách hàng, tình trạng follow, coach phụ trách và lịch sử xử lý trong một nơi.": "All clients, follow status, assigned coach and follow history in one workspace.",
  "Chưa phân công": "Unassigned",
  "Lưu": "Save",
  "Hủy": "Cancel",
  "Đóng": "Close",
  "Ghi nhận follow": "Record follow",
  "Cập nhật": "Update",
  "Lịch sử": "History",
  "Ghi chú": "Note",
  "Ngày follow tiếp theo": "Next follow date",
  "Cần kết nối": "Need connection",
  "Không kết nối": "No connection needed",
};

const EN_TO_VI: Record<string, string> = Object.fromEntries(
  Object.entries(VI_TO_EN).map(([vi, en]) => [en, vi]),
);

function translateExactTextNodes(language: Language) {
  if (typeof document === "undefined") return;
  const map = language === "en" ? VI_TO_EN : EN_TO_VI;
  document.documentElement.lang = language;
  document.documentElement.dataset.language = language;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "SELECT", "OPTION"].includes(parent.tagName)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);

  for (const node of nodes) {
    const raw = node.nodeValue || "";
    const trimmed = raw.trim();
    const translated = map[trimmed];
    if (!translated) continue;
    node.nodeValue = raw.replace(trimmed, translated);
  }

  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input[placeholder], textarea[placeholder]").forEach((field) => {
    const value = field.placeholder.trim();
    const translated = map[value];
    if (translated) field.placeholder = translated;
  });
}

export default function LanguageToggle() {
  const [language, setLanguage] = useState<Language>("vi");

  useEffect(() => {
    const stored = window.localStorage.getItem("fxa-language") as Language | null;
    const next = stored === "en" || stored === "vi" ? stored : "vi";
    setLanguage(next);
    translateExactTextNodes(next);

    const observer = new MutationObserver(() => translateExactTextNodes(next));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  function choose(next: Language) {
    setLanguage(next);
    window.localStorage.setItem("fxa-language", next);
    translateExactTextNodes(next);
    window.location.reload();
  }

  return (
    <div className="fixed bottom-4 left-4 z-[90] flex rounded-full border border-yellow-400/25 bg-black/85 p-1 text-[11px] font-black uppercase tracking-[0.12em] shadow-2xl shadow-black/50 backdrop-blur">
      <button
        type="button"
        onClick={() => choose("vi")}
        className={`rounded-full px-3 py-2 transition ${language === "vi" ? "bg-yellow-400 text-black" : "text-zinc-300 hover:text-yellow-300"}`}
        aria-pressed={language === "vi"}
      >
        VI
      </button>
      <button
        type="button"
        onClick={() => choose("en")}
        className={`rounded-full px-3 py-2 transition ${language === "en" ? "bg-yellow-400 text-black" : "text-zinc-300 hover:text-yellow-300"}`}
        aria-pressed={language === "en"}
      >
        EN
      </button>
    </div>
  );
}
