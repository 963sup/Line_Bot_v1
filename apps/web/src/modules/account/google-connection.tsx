"use client";
export function GoogleConfirmation({
  busy,
  lineName,
  googleEmail,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  lineName: string;
  googleEmail: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <section>
      <h2>確認 Google 綁定</h2>
      <p>LINE：{lineName}</p>
      <p>Google：{googleEmail}</p>
      <p>請核對 Google 帳號；確認後才會關聯目前的 LINE 會員。</p>
      <button disabled={busy} onClick={onConfirm}>
        確認綁定 Google
      </button>
      <button className="secondary" disabled={busy} onClick={onCancel}>
        取消綁定
      </button>
    </section>
  );
}
export function GoogleConnection({
  googleEmail,
  pending,
  busy,
  onStart,
  onCancel,
  onUnlink,
}: {
  googleEmail: string | null;
  pending: boolean;
  busy: boolean;
  onStart: () => void;
  onCancel: () => void;
  onUnlink: () => void;
}) {
  return (
    <>
      <p>{googleEmail ? `已綁定 Google：${googleEmail}` : "Google 尚未綁定（選填）"}</p>
      {googleEmail && (
        <button className="secondary" disabled={busy} onClick={onUnlink}>
          解除 Google 綁定
        </button>
      )}
      {!googleEmail && (
        <>
          {pending && (
            <p>請在外部瀏覽器完成 Google 登入，再回此處重新整理並確認。連結有效期為 10 分鐘。</p>
          )}
          <button className="secondary" disabled={busy} onClick={onStart}>
            {pending ? "重新選擇 Google 帳號" : "綁定 Google（選填）"}
          </button>
          {pending && (
            <button className="secondary" disabled={busy} onClick={onCancel}>
              取消請求
            </button>
          )}
        </>
      )}
    </>
  );
}
