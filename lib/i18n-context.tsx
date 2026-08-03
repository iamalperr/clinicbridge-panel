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

  const t = (key: string): string => {
    const keys = key.split(".");
    let result: TranslationValue | undefined = translations[language];
    
    for (const k of keys) {
      if (result && typeof result === "object" && result[k]) {
        result = result[k];
      } else {
        result = undefined;
        break;
      }
    }

    // Fallback to Turkish or English if not found in current language
    if (result === undefined && language !== "tr") {
      let fallbackResult: TranslationValue | undefined = translations["tr"];
      for (const k of keys) {
        if (fallbackResult && typeof fallbackResult === "object" && fallbackResult[k]) {
          fallbackResult = fallbackResult[k];
        } else {
          fallbackResult = undefined;
          break;
        }
      }
      if (typeof fallbackResult === "string") return fallbackResult;
    }

    if (result === undefined) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[i18n] Missing translation key: "${key}" for language: "${language}"`);
      }
      return key;
    }
    
    return typeof result === "string" ? result : key;
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
  if (context === undefined) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
