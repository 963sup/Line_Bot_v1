import Link from "next/link";
export default function Page() {
  return (
    <main className="app-content">
      <h1>繼續使用工作助手</h1>
      <p>工作台會核對你的會員資格；Google 與群組設定為選填。</p>
      <Link className="diary-link" href="/home">
        進入工作台
      </Link>
    </main>
  );
}
