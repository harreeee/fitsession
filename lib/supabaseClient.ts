import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
}

if (!supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable.");
}

export const AUTH_STORAGE_KEY = "fxa-fitness-auth";
export const REMEMBER_LOGIN_KEY = "fxa-remember-login";

function isBrowser() {
  return typeof window !== "undefined";
}

export function getRememberLoginPreference() {
  if (!isBrowser()) return true;

  const saved = window.localStorage.getItem(REMEMBER_LOGIN_KEY);

  // Default ON so Client/PT stay signed in unless the user turns it off.
  if (saved === null) return true;

  return saved === "true";
}

function getSelectedStorage() {
  if (!isBrowser()) return undefined;

  return getRememberLoginPreference()
    ? window.localStorage
    : window.sessionStorage;
}

function getOtherStorage() {
  if (!isBrowser()) return undefined;

  return getRememberLoginPreference()
    ? window.sessionStorage
    : window.localStorage;
}

const authStorage = {
  getItem(key: string) {
    if (!isBrowser()) return null;

    const selectedStorage = getSelectedStorage();
    const selectedValue = selectedStorage?.getItem(key) ?? null;

    if (selectedValue) return selectedValue;

    // Backward compatibility for users who were already logged in before
    // the Remember me option was added. Only migrate automatically when the
    // user has never explicitly chosen a Remember me preference.
    const hasExplicitPreference =
      window.localStorage.getItem(REMEMBER_LOGIN_KEY) !== null;

    if (!hasExplicitPreference) {
      const legacyLocalValue = window.localStorage.getItem(key);

      if (legacyLocalValue) {
        window.localStorage.setItem(REMEMBER_LOGIN_KEY, "true");
        return legacyLocalValue;
      }
    }

    return null;
  },

  setItem(key: string, value: string) {
    if (!isBrowser()) return;

    const selectedStorage = getSelectedStorage();
    const otherStorage = getOtherStorage();

    selectedStorage?.setItem(key, value);
    otherStorage?.removeItem(key);
  },

  removeItem(key: string) {
    if (!isBrowser()) return;

    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  },
};

export function setRememberLoginPreference(remember: boolean) {
  if (!isBrowser()) return;

  const currentLocalSession = window.localStorage.getItem(AUTH_STORAGE_KEY);
  const currentSessionSession = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
  const currentSession = currentLocalSession ?? currentSessionSession;

  window.localStorage.setItem(REMEMBER_LOGIN_KEY, String(remember));

  if (!currentSession) return;

  if (remember) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, currentSession);
    window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  } else {
    window.sessionStorage.setItem(AUTH_STORAGE_KEY, currentSession);
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: AUTH_STORAGE_KEY,
    storage: isBrowser() ? authStorage : undefined,
  },
});