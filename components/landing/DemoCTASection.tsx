"use client";

import { useState, FormEvent } from "react";
import { useLandingLang } from "@/lib/landing-translations";
import { CheckCircle, ArrowRight, Loader2, AlertCircle } from "lucide-react";
import { submitDemoRequest } from "@/lib/services/demoRequestService";

const EMPTY_FORM = {
  fullName: "",
  clinicName: "",
  phone: "",
  email: "",
  website: "",
  message: "",
};

type FormState = typeof EMPTY_FORM;
type SubmitState = "idle" | "loading" | "success" | "error";

function validate(form: FormState, lang: "tr" | "en"): string | null {
  if (!form.fullName.trim()) {
    return lang === "tr" ? "Ad Soyad zorunludur." : "Full name is required.";
  }
  if (!form.clinicName.trim()) {
    return lang === "tr" ? "Klinik Adı zorunludur." : "Clinic name is required.";
  }
  if (!form.phone.trim() && !form.email.trim()) {
    return lang === "tr"
      ? "Telefon veya e-posta alanlarından en az biri zorunludur."
      : "At least one of phone or email is required.";
  }
  if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    return lang === "tr"
      ? "Geçerli bir e-posta adresi girin."
      : "Please enter a valid email address.";
  }
  return null;
}

export default function DemoCTASection() {
  const { t, lang } = useLandingLang();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (validationError) setValidationError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const error = validate(form, lang);
    if (error) {
      setValidationError(error);
      return;
    }

    setSubmitState("loading");
    setServerError(null);

    try {
      await submitDemoRequest(form);
      setSubmitState("success");
      setForm(EMPTY_FORM);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "";
      console.error("[DemoForm] Submit failed:", errMsg, err);
      setServerError(
        errMsg ||
          (lang === "tr"
            ? "Bir hata oluştu. Lütfen tekrar deneyin."
            : "Something went wrong. Please try again.")
      );
      setSubmitState("error");
    }
  };

  const f = t.demo.form;
  const isLoading = submitState === "loading";

  return (
    <section className="lp-section lp-demo-section" id="contact">
      <div className="lp-container">
        <h2 className="lp-section-title">{t.demo.title}</h2>
        <p className="lp-section-subtitle">{t.demo.subtitle}</p>

        <div className="lp-form-wrap">
          {submitState === "success" ? (
            <div className="lp-form-success">
              <div className="lp-form-success-icon">
                <CheckCircle size={28} />
              </div>
              <p>{f.success}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className="lp-form-grid">
                <div className="lp-form-group">
                  <label>{f.name} *</label>
                  <input
                    type="text"
                    placeholder={f.namePlaceholder}
                    value={form.fullName}
                    onChange={(e) => handleChange("fullName", e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div className="lp-form-group">
                  <label>{f.clinic} *</label>
                  <input
                    type="text"
                    placeholder={f.clinicPlaceholder}
                    value={form.clinicName}
                    onChange={(e) => handleChange("clinicName", e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div className="lp-form-group">
                  <label>{f.phone}</label>
                  <input
                    type="tel"
                    placeholder={f.phonePlaceholder}
                    value={form.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div className="lp-form-group">
                  <label>{f.email}</label>
                  <input
                    type="email"
                    placeholder={f.emailPlaceholder}
                    value={form.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div className="lp-form-group lp-form-full">
                  <label>{f.website}</label>
                  <input
                    type="url"
                    placeholder={f.websitePlaceholder}
                    value={form.website}
                    onChange={(e) => handleChange("website", e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div className="lp-form-group lp-form-full">
                  <label>{f.message}</label>
                  <textarea
                    placeholder={f.messagePlaceholder}
                    value={form.message}
                    onChange={(e) => handleChange("message", e.target.value)}
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Validation error */}
              {validationError && (
                <div className="lp-form-error">
                  <AlertCircle size={15} />
                  {validationError}
                </div>
              )}

              {/* Server error */}
              {serverError && (
                <div className="lp-form-error">
                  <AlertCircle size={15} />
                  {serverError}
                </div>
              )}

              <button
                type="submit"
                className="lp-btn lp-btn-primary lp-form-submit"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 size={18} className="lp-spin" />
                    {lang === "tr" ? "Gönderiliyor..." : "Sending..."}
                  </>
                ) : (
                  <>
                    {f.submit} <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
