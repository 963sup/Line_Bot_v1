import Link from "next/link";
import { lineMiniApp } from "../../shared/server/line-mini-app";
import PublicEntry from "./_entry/public-entry";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main className="public-gateway">
      <div className="public-gateway-brand">
        <div className="public-gateway-mark" aria-hidden="true">
          L
        </div>
        <h1>LINE 工作助手</h1>
        <p>使用 LINE 進入你的工作台</p>
      </div>

      <div className="public-gateway-actions">
        <PublicEntry liffId={lineMiniApp().liffId} />
        <Link className="public-gateway-primary" href="/home">
          使用 LINE 進入
        </Link>
        <p className="public-gateway-secondary">
          首次使用？<Link href="/membership/register">建立會員資格</Link>
        </p>
        <nav className="public-gateway-legal" aria-label="法律與服務資訊">
          <Link href="/privacy">隱私權</Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms">服務條款</Link>
        </nav>
      </div>
    </main>
  );
}
