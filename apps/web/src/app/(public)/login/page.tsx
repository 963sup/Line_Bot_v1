import Link from "next/link";
export default function Page() {
  return (
    <main className="app-content">
      <h1>登入工作助手</h1>
      <p>使用 LINE 身分登入後，確認會員資格。</p>
      <Link className="diary-link" href="/home">
        以 LINE 繼續
      </Link>
    </main>
  );
}
