"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import tr from "@/locales/tr.json";
import en from "@/locales/en.json";
import de from "@/locales/de.json";
import ar from "@/locales/ar.json";
import es from "@/locales/es.json";

type Language = "tr" | "en" | "de" | "ar" | "es";

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

type TranslationValue = string | { [key: string]: TranslationValue };
type TranslationSchema = { [key: string]: TranslationValue };

const translations: Record<Language, TranslationSchema> = { 
  tr: tr as TranslationSchema, 
  en: en as TranslationSchema, 
  de: de as TranslationSchema, 
  ar: ar as TranslationSchema, 
  es: es as TranslationSchema 
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("tr");
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const savedLang = localStorage.getItem("cb_language") as Language;
    if (savedLang && translations[savedLang] && savedLang !== "tr") {
       
      setLanguageState(savedLang);
    }
    setIsLoaded(true);
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem("cb_language", lang);
    // Force direction for Arabic
    if (typeof document !== "undefined") {
      document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
      document.documentElement.lang = lang;
    }
  };

  const lookupKey = (lang: Language, keyPath: string[]): string | undefined => {
    let current: TranslationValue | undefined = translations[lang];
    for (const k of keyPath) {
      if (current && typeof current === "object" && k in current) {
        current = current[k];
      } else {
        return undefined;
      }
    }
    return typeof current === "string" ? current : undefined;
  };

  const t = (key: string): string => {
    if (!key) return "";
    const keys = key.split(".");
    
    // 1. Try active language
    const val = lookupKey(language, keys);
    if (val !== undefined && val !== "") return val;

    // 2. Fallback to Turkish if active language is not Turkish
    if (language !== "tr") {
      const fallbackTr = lookupKey("tr", keys);
      if (fallbackTr !== undefined && fallbackTr !== "") return fallbackTr;
    }

    // 3. Fallback to English if active language is not English
    if (language !== "en") {
      const fallbackEn = lookupKey("en", keys);
      if (fallbackEn !== undefined && fallbackEn !== "") return fallbackEn;
    }

    // 4. Missing key handling: Log in dev, never leak raw dotted technical keys to production UI
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[i18n] Missing translation key: "${key}" for language: "${language}"`);
    }

    // Returning empty string ensures expressions like `t("common.all") || "Tümü"` evaluate the human fallback
    return "";
  };

  if (!isLoaded) return null;

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
