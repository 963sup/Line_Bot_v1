"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="zh-Hant">
      <body>
        <main>
          <h1>發生錯誤</h1>
          <p>請重新開啟頁面後再試一次。</p>
        </main>
      </body>
    </html>
  );
}
