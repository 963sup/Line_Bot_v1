import { DIARY_FORM_URL } from "../../../modules/diary/form";
import AppShell from "../_shell/app-shell";
export default function Page() {
  return (
    <AppShell>
      <h1>工作日誌</h1>
      <p>前往既有表單填寫，這裡不保存表單內容。</p>
      <a className="diary-link" href={DIARY_FORM_URL} target="_blank" rel="noreferrer">
        填寫日誌 ↗
      </a>
    </AppShell>
  );
}
