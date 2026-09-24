"use client";
import type { PartnerContact } from "@line-work/partners/contracts";
import { partnerContactHref } from "@line-work/partners/domain";
import { useState } from "react";

export default function ContactMethods({
  contact,
}: {
  contact: Pick<PartnerContact, "phone" | "email" | "line">;
}) {
  const [notice, setNotice] = useState("");
  return (
    <>
      {(["phone", "email", "line"] as const).map((method) => {
        const value = contact[method];
        if (!value) return null;
        const label = method === "phone" ? "電話" : method === "email" ? "Email" : "LINE";
        const href = partnerContactHref(method, value);
        return (
          <p key={method}>
            {label}：{href ? <a href={href}>{value}</a> : <span>{value}</span>}{" "}
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(value);
                  setNotice(`${label} 已複製。`);
                } catch {
                  setNotice("無法自動複製，請選取聯繫方式後手動複製。");
                }
              }}
            >
              複製{label}
            </button>
          </p>
        );
      })}
      {notice && <p role="status">{notice}</p>}
    </>
  );
}
