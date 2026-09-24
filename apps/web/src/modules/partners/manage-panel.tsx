"use client";
import type { Partner, PartnerContact, PartnersView } from "@line-work/partners/contracts";
import type { PartnerCommand } from "@line-work/partners/domain";
import { parsePartnerCommand } from "@line-work/partners/domain";
import { useEffect, useRef, useState } from "react";
import { liffClient } from "../../shared/browser/liff-client";
import MiniAppRuntime from "../../shared/browser/mini-app-runtime";
import { PageHeading, PageState } from "../../shared/ui/page-layout";
import ContactMethods from "./contact-methods";

type Save = Extract<PartnerCommand, { action: "save-partner" }>;
type Pending = { userId: string; command: Save };
const storageKey = "partner-management-pending";
const newContact = (partnerId: string): PartnerContact => ({
  id: crypto.randomUUID(),
  partnerId,
  name: "",
  responsibility: "",
  phone: "",
  email: "",
  line: "",
  status: "published",
});

export default function PartnerManagement({ liffId }: { liffId: string }) {
  const [data, setData] = useState<PartnersView | null>(null);
  const [draft, setDraft] = useState<Partner | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  function clear() {
    sequence.current++;
    setData(null);
    setDraft(null);
    setPending(null);
    setError("");
    setNotice("");
    setBusy(false);
  }
  async function read(token: string, after?: string): Promise<PartnersView> {
    const response = await fetch(
      `/api/partners?view=manage${after ? `&after=${encodeURIComponent(after)}` : ""}`,
      { headers: { "x-line-token": token }, cache: "no-store" },
    );
    const value = await response.json();
    if (!response.ok) throw new Error(value.error ?? "合作夥伴資料暫不可用。");
    return value;
  }
  async function load(after?: string) {
    const ticket = ++sequence.current;
    setData(null);
    setDraft(null);
    setPending(null);
    setError("");
    setBusy(true);
    try {
      const token = await liffClient.session(liffId);
      if (!token) throw new Error("請完成 LINE 登入後重試。");
      const value = await read(token, after);
      if (ticket !== sequence.current) return;
      if ((await liffClient.session(liffId)) !== token)
        throw new Error("LINE 身分已變更，請重新讀取。");
      if (ticket !== sequence.current) return;
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const old = JSON.parse(saved) as Pending;
        if (old.userId === value.userId) {
          const command = parsePartnerCommand(old.command);
          if (command.action !== "save-partner") throw new Error("待確認操作格式不正確。");
          setPending({ userId: old.userId, command });
        } else sessionStorage.removeItem(storageKey);
      }
      setData(value);
    } catch (failure) {
      if (ticket === sequence.current)
        setError(failure instanceof Error ? failure.message : "查詢失敗，請重試。");
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  }
  async function send(operation: Pending) {
    const ticket = ++sequence.current;
    setBusy(true);
    setError("");
    setNotice("");
    let submitted = false;
    let validated = false;
    try {
      const command = parsePartnerCommand(operation.command);
      if (command.action !== "save-partner") throw new Error("管理操作不正確。");
      validated = true;
      const token = await liffClient.session(liffId);
      if (!token) throw new Error("請完成 LINE 登入後重試。");
      const current = await read(token);
      if (ticket !== sequence.current) return;
      if (current.userId !== operation.userId || (await liffClient.session(liffId)) !== token) {
        sessionStorage.removeItem(storageKey);
        setData(null);
        setDraft(null);
        setPending(null);
        throw new Error("LINE 身分已變更，請重新讀取後編輯。");
      }
      if (ticket !== sequence.current) return;
      sessionStorage.setItem(storageKey, JSON.stringify({ userId: operation.userId, command }));
      setPending({ userId: operation.userId, command });
      submitted = true;
      const response = await fetch("/api/partners", {
        method: "POST",
        headers: { "x-line-token": token, "content-type": "application/json" },
        body: JSON.stringify(command),
      });
      const result = await response.json();
      if (ticket !== sequence.current) return;
      if ((await liffClient.session(liffId)) !== token) {
        clear();
        return;
      }
      if (ticket !== sequence.current) return;
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          sessionStorage.removeItem(storageKey);
          setPending(null);
          if ([401, 403, 409].includes(response.status)) {
            setData(null);
            setDraft(null);
          }
        }
        throw new Error(result.error ?? "保存結果尚未確認，請重試原操作。");
      }
      if (
        result.id !== command.id ||
        result.version !== command.expectedVersion + 1 ||
        result.requestId !== command.requestId ||
        !Number.isFinite(result.at)
      )
        throw new Error("保存回執不完整，請重試原操作。");
      sessionStorage.removeItem(storageKey);
      setPending(null);
      setDraft(null);
      setNotice(`已保存版本 ${result.version}；操作編號 ${result.requestId}。`);
      await load();
    } catch (failure) {
      if (ticket === sequence.current) {
        setError(failure instanceof Error ? failure.message : "保存失敗，請重試。");
        if (!submitted && validated) {
          setData(null);
          setDraft(null);
        }
      }
    } finally {
      if (ticket === sequence.current) setBusy(false);
    }
  }
  useEffect(() => {
    const visibility = () => {
      if (document.visibilityState === "hidden") clear();
      else void load();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", clear);
    return () => {
      sequence.current++;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", clear);
    };
  }, []);
  const blocked = busy || Boolean(pending);
  return (
    <>
      <PageHeading
        title="合作夥伴管理"
        back="/admin"
        description="維護合作夥伴、窗口與聯繫方式。"
      />
      <MiniAppRuntime liffId={liffId} onReady={() => load()} onWait={clear} />
      <button type="button" disabled={busy || Boolean(draft)} onClick={() => void load()}>
        重新讀取
      </button>
      {busy && <p role="status">處理中…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {pending && (
        <section>
          <h2>上次操作待確認</h2>
          <p>請重試原操作以取得結果，不會重複建立資料。</p>
          <button type="button" disabled={busy} onClick={() => void send(pending)}>
            重試原操作
          </button>
        </section>
      )}
      {!busy && !error && !data && (
        <PageState title="請完成 LINE 登入">將以你的會員身分確認管理資格。</PageState>
      )}
      {data && !draft && (
        <>
          <button
            type="button"
            disabled={blocked}
            onClick={() => {
              const id = crypto.randomUUID();
              setDraft({
                id,
                name: "",
                category: "",
                region: "",
                status: "published",
                version: 0,
                contacts: [newContact(id)],
              });
              setNotice("");
            }}
          >
            新增合作夥伴
          </button>
          <h2>合作夥伴</h2>
          {data.partners.length === 0 && (
            <PageState title="此頁沒有合作夥伴">可新增合作夥伴，或重新讀取第一頁。</PageState>
          )}
          {data.partners.map((partner) => (
            <section key={partner.id}>
              <h3>
                {partner.name}（{partner.status === "published" ? "已刊登" : "已下架"}）
              </h3>
              <p>
                {partner.category}
                {partner.region ? ` · ${partner.region}` : ""}
              </p>
              <button
                type="button"
                disabled={blocked}
                onClick={() => {
                  setDraft(structuredClone(partner));
                  setNotice("");
                }}
              >
                編輯{partner.name}
              </button>
              <details>
                <summary>窗口與聯繫方式（{partner.contacts.length}）</summary>
                {partner.contacts.length === 0 && <p>尚無窗口。</p>}
                {partner.contacts.map((contact) => (
                  <div key={contact.id}>
                    <h4>
                      {contact.name}（{contact.status === "published" ? "已刊登" : "已下架"}）
                    </h4>
                    <p>{contact.responsibility}</p>
                    <ContactMethods contact={contact} />
                  </div>
                ))}
              </details>
            </section>
          ))}
          {data.next && (
            <button type="button" disabled={blocked} onClick={() => void load(data.next!)}>
              下一頁
            </button>
          )}
        </>
      )}
      {data && draft && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            if (form.get("consent") !== "on") return;
            void send({
              userId: data.userId,
              command: {
                action: "save-partner",
                requestId: crypto.randomUUID(),
                id: draft.id,
                expectedVersion: draft.version,
                name: draft.name,
                category: draft.category,
                region: draft.region,
                status: draft.status,
                contacts: draft.contacts.map(({ partnerId: _partnerId, ...contact }) => contact),
                consentConfirmed: true,
                reason: String(form.get("reason") ?? ""),
              },
            });
          }}
        >
          <h2>{draft.version ? "編輯合作夥伴" : "新增合作夥伴"}</h2>
          <p>尚未保存。取消或離開會放棄未送出的修改；下架後會員無法查閱相關資料。</p>
          <fieldset disabled={blocked}>
            <legend>夥伴資料</legend>
            <label>
              夥伴名稱
              <input
                required
                maxLength={120}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
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
              夥伴狀態
              <select
                value={draft.status}
                onChange={(e) =>
                  setDraft({ ...draft, status: e.target.value as Partner["status"] })
                }
              >
                <option value="published">刊登</option>
                <option value="unlisted">下架</option>
              </select>
            </label>
            {draft.contacts.map((contact, index) => (
              <fieldset key={contact.id}>
                <legend>窗口 {index + 1}</legend>
                {(["name", "responsibility", "phone", "email", "line"] as const).map((key) => (
                  <label key={key}>
                    {
                      {
                        name: "窗口姓名",
                        responsibility: "負責事項",
                        phone: "電話",
                        email: "Email",
                        line: "LINE ID 或連結",
                      }[key]
                    }
                    <input
                      required={key === "name" || key === "responsibility"}
                      maxLength={key === "name" ? 80 : 160}
                      value={contact[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          contacts: draft.contacts.map((c) =>
                            c.id === contact.id ? { ...c, [key]: e.target.value } : c,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
                <label>
                  窗口狀態
                  <select
                    value={contact.status}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        contacts: draft.contacts.map((c) =>
                          c.id === contact.id
                            ? { ...c, status: e.target.value as Partner["status"] }
                            : c,
                        ),
                      })
                    }
                  >
                    <option value="published">刊登</option>
                    <option value="unlisted">下架</option>
                  </select>
                </label>
              </fieldset>
            ))}
            <button
              type="button"
              disabled={draft.contacts.length >= 20}
              onClick={() =>
                setDraft({ ...draft, contacts: [...draft.contacts, newContact(draft.id)] })
              }
            >
              增加窗口
            </button>
            <label>
              修改原因
              <textarea name="reason" required maxLength={500} />
            </label>
            <label>
              <input name="consent" type="checkbox" required />
              我已核實聯繫方式及向有效會員分享資料的同意。
            </label>
            <button type="submit">確認儲存</button>
            <button type="button" onClick={() => setDraft(null)}>
              取消
            </button>
          </fieldset>
        </form>
      )}
    </>
  );
}
