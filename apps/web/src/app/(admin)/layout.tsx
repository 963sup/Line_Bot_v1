import Link from "next/link";
import type { ReactNode } from "react";
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div>
      <a className="skip-link" href="#admin-content">
        跳至主要內容
      </a>
      <header className="app-content">
        <nav aria-label="管理導覽">
          <Link href="/admin">管理首頁</Link>
          {" · "}
          <Link href="/home">返回工作台</Link>
        </nav>
      </header>
      <main id="admin-content" className="app-content">
        {children}
      </main>
    </div>
  );
}
