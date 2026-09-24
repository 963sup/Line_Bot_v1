import Link from "next/link";
import { lineMiniApp } from "../../shared/server/line-mini-app";
import PublicEntry from "./_entry/public-entry";
export const dynamic = "force-dynamic";
export default function Page() {
  return (
    <main className="app-content">
      <p className="eyebrow">LINE 工作助手</p>
      <h1>讓每天的工作，更有條理。</h1>
      <p>透過 LINE 使用出勤、日誌與收據整理服務。</p>
      <PublicEntry liffId={lineMiniApp().liffId} />
      <p>
        <Link className="diary-link" href="/home">
          進入個人工作台
        </Link>
      </p>
      <p>
        <Link href="/membership/register">首次使用，註冊 LINE 會員</Link>
      </p>
      <p>
        <Link href="/privacy">隱私權</Link> · <Link href="/terms">服務條款</Link>
      </p>
    </main>
  );
}
