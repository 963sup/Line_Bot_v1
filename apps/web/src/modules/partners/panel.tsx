"use client";

import type { ContactMethod, PartnersView } from "@line-work/partners/contracts";
import type { PartnerCommand } from "@line-work/partners/domain";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import ContactMethods from "./contact-methods";
import styles from "./partners.module.css";

type Mode = "news" | "directory" | "referrals";
type Draft = {
  partnerName: string;
  category: string;
  region: string;
  contactName: string;
  responsibility: string;
  method: ContactMethod;
  value: string;
  reason: string;
};

const empty: Draft = {
  partnerName: "",
  category: "",
  region: "",
  contactName: "",
  responsibility: "",
  method: "phone",
  value: "",
  reason: "",
};
const labels: Record<Mode, string> = {
  news: "最新消息",
  directory: "合作夥伴",
  referrals: "夥伴推薦",
};
const date = (value: number | null) =>
  value ? new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : "尚未審核";

export default function PartnersPanel({ liffId, mode }: { liffId: string; mode: Mode }) {
  const [data, setData] = useState<PartnersView | null>(null);
  const [after, setAfter] = useState<string>();
  const [draft, setDraft] = useState<Draft>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<PartnerCommand | null>(null);
  const sequence = useRef(0);
  const token = useRef("");

  function clear() {
    sequence.current++;
    token.current = "";
    setData(null);
    setNotice("");
  }

  async function request(init: RequestInit = {}, cursor?: string) {
    const access = await liffClient.session(liffId);
    if (!access) throw new Error("請完成 LINE 登入後重試。");
    token.current = access;
    const response = await fetch(
      init.method === "POST"
        ? "/api/partners"
        : `/api/partners?view=${mode}${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`,
      {
        ...init,
        cache: "no-store",
        headers: {
          "x-line-token": access,
          ...(init.body ? { "content-type": "application/json" } : {}),
        },
        signal: AbortSignal.timeout(20000),
      },
    );
    const payload = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) clear();
      throw new Error(payload.error ?? "夥伴服務暫不可用。");
    }
    return payload;
  }

  async function load(cursor?: string) {
    const ticket = ++sequence.current;
    setBusy(true);
    setError("");
    try {
      const payload = (await request({}, cursor)) as PartnersView;
      if (ticket !== sequence.current) return;
      if (cursor && data && payload.userId !== data.userId) {
        clear();
        setError("會員身分已變更，請重新讀取名錄。");
        setBusy(false);
        return;
      }
      setData(payload);
      setAfter(cursor);
    } catch (failure) {
      if (ticket === sequence.current)
        setError(failure instanceof Error ? failure.message : "讀取失敗。");
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  }

  async function send(command: PartnerCommand) {
    const ticket = sequence.current;
    setBusy(true);
    setError("");
    setNotice("");
    setPending(command);
    try {
      await request({ method: "POST", body: JSON.stringify(command) });
      if (ticket !== sequence.current) return;
      setPending(null);
      setDraft(empty);
      setNotice(command.action === "withdraw" ? "推薦已撤回。" : "推薦已送出。");
      await load();
    } catch (failure) {
      if (ticket === sequence.current)
        setError(failure instanceof Error ? failure.message : "結果尚未確認，請重試。");
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  }

  useEffect(() => {
    const change = () => {
      if (document.visibilityState === "hidden") clear();
      else void load();
    };
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);

  return (
    <div className={styles.panel}>
      <MiniAppRuntime liffId={liffId} onReady={load} onWait={clear} />
      <nav className={styles.tabs} aria-label="夥伴功能">
        <Link aria-current={mode === "news" ? "page" : undefined} href="/partners/news">
          最新消息
        </Link>
        <Link aria-current={mode === "directory" ? "page" : undefined} href="/partners">
          合作夥伴
        </Link>
        <Link aria-current={mode === "referrals" ? "page" : undefined} href="/partners/referrals">
          夥伴推薦
        </Link>
      </nav>
      <h2>{labels[mode]}</h2>
      {mode === "directory" && (
        <button disabled={busy} onClick={() => void load()}>
          重新讀取名錄
        </button>
      )}
      {busy && <p role="status">處理中…</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {pending && !busy && (
        <button type="button" onClick={() => void send(pending)}>
          重試上次操作
        </button>
      )}
      {data && mode === "news" && (
        <section className={styles.grid}>
          {data.news.length === 0 && <p>目前還沒有推薦成功的夥伴消息。</p>}
          {data.news.map((item) => (
            <article className={styles.row} key={item.referralId}>
              <span className={styles.meta}>{date(item.successfulAt)}</span>
              <strong>{item.partnerName} 已加入合作夥伴</strong>
              <span>
                {item.category} · {item.contactName} · {item.responsibility}
              </span>
            </article>
          ))}
        </section>
      )}
      {data && mode === "directory" && (
        <section className={styles.grid}>
          {data.partners.length === 0 && <p>目前沒有已發布的合作夥伴。</p>}
          {data.partners.map((partner) => (
            <article className={styles.card} key={partner.id}>
              <h3>{partner.name}</h3>
              <p className={styles.meta}>
                {partner.category}
                {partner.region ? ` · ${partner.region}` : ""}
              </p>
              {partner.contacts.map((contact) => (
                <div className={styles.contact} key={contact.id}>
                  <strong>{contact.name}</strong>
                  <p>{contact.responsibility}</p>
                  <ContactMethods contact={contact} />
                </div>
              ))}
            </article>
          ))}
        </section>
      )}
      {data && mode === "directory" && (
        <nav aria-label="名錄分頁">
          {after && (
            <button disabled={busy} onClick={() => void load()}>
              回到第一頁
            </button>
          )}
          {data.next && (
            <button disabled={busy} onClick={() => void load(data.next!)}>
              下一頁
            </button>
          )}
        </nav>
      )}
      {data && mode === "referrals" && (
        <>
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              void send({ action: "refer", requestId: crypto.randomUUID(), ...draft });
            }}
          >
            <label>
              夥伴名稱
              <input
                required
                maxLength={120}
                value={draft.partnerName}
                onChange={(e) => setDraft({ ...draft, partnerName: e.target.value })}
              />
            </label>
            <label>
              合作類型
              <input
                required
                maxLength={80}
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              />
            </label>
            <label>
              地區
              <input
                maxLength={80}
                value={draft.region}
                onChange={(e) => setDraft({ ...draft, region: e.target.value })}
              />
            </label>
            <label>
              窗口姓名
              <input
                required
                maxLength={80}
                value={draft.contactName}
                onChange={(e) => setDraft({ ...draft, contactName: e.target.value })}
              />
            </label>
            <label>
              負責事項
              <input
                required
                maxLength={160}
                value={draft.responsibility}
                onChange={(e) => setDraft({ ...draft, responsibility: e.target.value })}
              />
            </label>
            <label>
              聯繫方式
              <select
                value={draft.method}
                onChange={(e) => setDraft({ ...draft, method: e.target.value as ContactMethod })}
              >
                <option value="phone">電話</option>
                <option value="email">Email</option>
                <option value="line">LINE</option>
              </select>
            </label>
            <label>
              聯繫內容
              <input
                required
                maxLength={160}
                value={draft.value}
                onChange={(e) => setDraft({ ...draft, value: e.target.value })}
              />
            </label>
            <label>
              推薦原因
              <textarea
                required
                maxLength={500}
                value={draft.reason}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
              />
            </label>
            <button disabled={busy || Boolean(pending)} type="submit">
              送出推薦
            </button>
          </form>
          <section className={styles.grid}>
            <h3>我的推薦</h3>
            {data.referrals.length === 0 && <p>目前沒有推薦案件。</p>}
            {data.referrals.map((referral) => (
              <article className={styles.row} key={referral.id}>
                <strong>{referral.partnerName}</strong>
                <span>
                  {referral.category} · {referral.contactName} · {referral.status}
                </span>
                <span className={styles.meta}>
                  送出：{date(referral.submittedAt)}；審核：{date(referral.reviewedAt)}
                </span>
                {referral.status === "pending" && (
                  <button
                    disabled={busy || Boolean(pending)}
                    type="button"
                    onClick={() =>
                      void send({
                        action: "withdraw",
                        requestId: crypto.randomUUID(),
                        referralId: referral.id,
                      })
                    }
                  >
                    撤回
                  </button>
                )}
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
