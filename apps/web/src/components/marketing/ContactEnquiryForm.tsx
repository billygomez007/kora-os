"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

const enquiryTypes = ["business", "support", "partnerships", "media", "careers", "general"] as const;
type FieldName = "name" | "email" | "country" | "type" | "message";

export default function ContactEnquiryForm() {
  const t = useTranslations("CompanyPages.contact.form");
  const searchParams = useSearchParams();
  const requestedType = searchParams.get("type");
  const initialType = enquiryTypes.includes(requestedType as (typeof enquiryTypes)[number]) ? requestedType ?? "" : "";
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [notice, setNotice] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextErrors: Partial<Record<FieldName, string>> = {};
    const required: FieldName[] = ["name", "email", "country", "type", "message"];
    for (const field of required) {
      if (!String(form.get(field) ?? "").trim()) nextErrors[field] = t("required");
    }
    const email = String(form.get("email") ?? "").trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) nextErrors.email = t("invalidEmail");
    setErrors(nextErrors);
    setNotice(Object.keys(nextErrors).length ? "" : t("unavailable"));
  }

  const fieldError = (field: FieldName) => errors[field] ? <span id={`${field}-error`} className="contact-field-error">{errors[field]}</span> : null;

  return (
    <form className="contact-form" onSubmit={submit} noValidate aria-describedby={notice ? "contact-form-notice" : undefined}>
      <div className="contact-form-grid">
        <label><span>{t("name")}</span><input name="name" autoComplete="name" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "name-error" : undefined} />{fieldError("name")}</label>
        <label><span>{t("email")}</span><input name="email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "email-error" : undefined} />{fieldError("email")}</label>
        <label><span>{t("phone")}</span><input name="phone" type="tel" autoComplete="tel" /></label>
        <label><span>{t("businessName")}</span><input name="businessName" autoComplete="organization" /></label>
        <label><span>{t("country")}</span><input name="country" autoComplete="country-name" aria-invalid={Boolean(errors.country)} aria-describedby={errors.country ? "country-error" : undefined} />{fieldError("country")}</label>
        <label>
          <span>{t("type")}</span>
          <select name="type" defaultValue={initialType} aria-invalid={Boolean(errors.type)} aria-describedby={errors.type ? "type-error" : undefined}>
            <option value="" disabled>{t("selectType")}</option>
            {enquiryTypes.map((type) => <option value={type} key={type}>{t(`types.${type}`)}</option>)}
          </select>
          {fieldError("type")}
        </label>
      </div>
      <label className="contact-message-field"><span>{t("message")}</span><textarea name="message" rows={6} aria-invalid={Boolean(errors.message)} aria-describedby={errors.message ? "message-error" : undefined} />{fieldError("message")}</label>
      {notice ? <div id="contact-form-notice" className="contact-form-notice" role="status">{notice}</div> : null}
      <button className="gold-btn" type="submit">{t("submit")}</button>
      <p className="contact-form-footnote">{t("footnote")}</p>
    </form>
  );
}
