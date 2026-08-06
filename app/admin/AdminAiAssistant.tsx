"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabaseClient";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type AssistantResponse = {
  success: boolean;
  answer?: string;
  error?: string;
  generatedAt?: string;
};

const SUGGESTED_QUESTIONS = [
  "Which clients have 5 or fewer sessions remaining?",
  "What demos are scheduled in the next 7 days?",
  "Which leads still need a trainer assigned?",
  "Who has the most completed sessions this month?",
];

function createMessageId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AdminAiAssistant() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi, I am FXA AI. Ask me about clients, remaining sessions, demos, leads, attendance, debt alerts, or staff activity. I am read-only and will not change your data.",
    },
  ]);

  const messageEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function askQuestion(rawQuestion?: string) {
    const cleanQuestion = (rawQuestion ?? question).trim();

    if (!cleanQuestion || loading) return;

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: "user",
      content: cleanQuestion,
    };

    const history = messages
      .filter((message) => message.id !== "welcome")
      .slice(-8)
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setLoading(true);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Your login session has expired. Please sign in again.");
      }

      const response = await fetch("/api/ai/admin-assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          question: cleanQuestion,
          history,
        }),
      });

      const data = (await response.json().catch(() => null)) as
        | AssistantResponse
        | null;

      if (!response.ok || !data?.success || !data.answer) {
        throw new Error(
          data?.error || `AI assistant request failed with ${response.status}.`,
        );
      }

      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          content: data.answer || "No answer was returned.",
        },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: createMessageId(),
          role: "assistant",
          content:
            error instanceof Error
              ? `I could not answer that question: ${error.message}`
              : "I could not answer that question.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void askQuestion();
  }

  function clearConversation() {
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content:
          "Conversation cleared. Ask me about clients, demos, leads, attendance, debt alerts, or staff activity.",
      },
    ]);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[120] flex items-center gap-3 rounded-2xl border border-violet-300/40 bg-violet-400 px-5 py-3 text-sm font-bold uppercase tracking-wide text-black shadow-[0_18px_60px_rgba(167,139,250,0.35)] transition hover:bg-violet-300 active:scale-[0.98]"
        aria-label="Open FXA AI Assistant"
      >
        <span className="text-lg" aria-hidden="true">
          ✦
        </span>
        Ask FXA AI
      </button>

      {open ? (
        <div className="fixed inset-0 z-[130] flex items-end justify-end bg-black/70 p-0 backdrop-blur-sm md:p-5">
          <section className="flex h-[100dvh] w-full flex-col overflow-hidden border border-violet-400/30 bg-[#090909] shadow-2xl md:h-[min(780px,calc(100dvh-40px))] md:max-w-xl md:rounded-[2rem]">
            <header className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(167,139,250,0.24),_transparent_45%),#0b0b0b] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-violet-300">
                      FXA AI Assistant
                    </p>
                    <span className="rounded-full border border-green-400/25 bg-green-400/10 px-2 py-1 text-[10px] font-semibold uppercase text-green-300">
                      Read-only
                    </span>
                  </div>

                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    Ask about your business
                  </h2>

                  <p className="mt-2 text-xs leading-5 text-gray-400">
                    Answers use current FXA data. Review important details before
                    making decisions.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-white/15 px-3 py-2 text-sm text-gray-300 transition hover:border-white/30 hover:text-white"
                  aria-label="Close FXA AI Assistant"
                >
                  Close
                </button>
              </div>
            </header>

            <div className="border-b border-white/10 px-4 py-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {SUGGESTED_QUESTIONS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => void askQuestion(item)}
                    disabled={loading}
                    className="shrink-0 rounded-full border border-violet-400/25 bg-violet-400/10 px-3 py-2 text-left text-xs text-violet-200 transition hover:bg-violet-400/20 disabled:opacity-50"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-5">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[90%] rounded-3xl border px-4 py-3 text-sm leading-6 md:max-w-[85%] ${
                      message.role === "user"
                        ? "border-yellow-400/30 bg-yellow-400 text-black"
                        : "border-white/10 bg-white/[0.06] text-gray-200"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              ))}

              {loading ? (
                <div className="flex justify-start">
                  <div className="rounded-3xl border border-violet-400/20 bg-violet-400/10 px-4 py-3 text-sm text-violet-200">
                    Reviewing FXA data...
                  </div>
                </div>
              ) : null}

              <div ref={messageEndRef} />
            </div>

            <form
              onSubmit={submitQuestion}
              className="border-t border-white/10 bg-black/80 p-4"
            >
              <textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void askQuestion();
                  }
                }}
                disabled={loading}
                maxLength={2000}
                placeholder="Ask: Which clients need renewal follow-up?"
                className="min-h-24 w-full resize-none rounded-2xl border border-white/15 bg-white/[0.05] px-4 py-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-violet-400 disabled:opacity-60"
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={clearConversation}
                  disabled={loading}
                  className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold uppercase text-gray-400 transition hover:text-white disabled:opacity-50"
                >
                  Clear
                </button>

                <button
                  type="submit"
                  disabled={loading || !question.trim()}
                  className="rounded-xl bg-violet-400 px-5 py-2.5 text-xs font-bold uppercase text-black transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Thinking..." : "Ask Question"}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
