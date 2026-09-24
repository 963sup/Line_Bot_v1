import Link from "next/link";
export default function Page() {
  return (
    <main className="app-content">
      <h1>服務暫不可用</h1>
      <p>請稍後重試。</p>
      <Link href="/settings">帳號設定</Link>
    </main>
  );
}
