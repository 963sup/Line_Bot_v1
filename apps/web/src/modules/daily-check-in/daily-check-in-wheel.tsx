"use client";
import type { CSSProperties, KeyboardEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import styles from "./daily-check-in-wheel.module.css";
import type { CheckInOutcome, CoinView, DailyCheckInClaim } from "./use-daily-check-in";

type WheelPhase =
  | "idle"
  | "confirming"
  | "spinning"
  | "result"
  | "pending"
  | "rejected"
  | "unknown";

type WheelStyle = CSSProperties & {
  "--wheel-rotation"?: string;
  "--wheel-target-rotation"?: string;
};

const colors = ["#f4cf58", "#a8dd8e", "#65c7ad", "#f19b6b", "#d7e66f", "#7db9e8"];

function coinText(amount: number) {
  return `${amount.toLocaleString("zh-TW", { maximumFractionDigits: 1 })} Coin`;
}

function prizeDescription(coins: CoinView, code: string) {
  const prize = coins.policy.prizes.find((item) => item.code === code);
  return prize ? coinText(prize.amount) : coinText(coins.claim?.reward ?? 0);
}

function resultText(claim: DailyCheckInClaim | null, coins: CoinView) {
  if (!claim) return "今日簽到結果尚未回來，請重新整理狀態。";
  if (claim.policyVersion !== coins.policy.version)
    return `${claim.day} 已領取 ${coinText(claim.reward)}。`;
  return `${claim.day} 抽中 ${prizeDescription(coins, claim.prizeCode)}。`;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function wheelBackground(coins: CoinView) {
  let current = 0;
  const stops = coins.policy.prizes.flatMap((prize, index) => {
    const start = (current / coins.policy.totalWeight) * 360;
    current += prize.weight;
    const end = (current / coins.policy.totalWeight) * 360;
    const color = colors[index % colors.length];
    return [`${color} ${start}deg`, `${color} ${end}deg`];
  });
  return stops.length ? `conic-gradient(${stops.join(", ")})` : "#eef3ef";
}

function targetRotation(coins: CoinView, claim: DailyCheckInClaim) {
  let current = 0;
  for (const prize of coins.policy.prizes) {
    const start = current;
    current += prize.weight;
    if (prize.code !== claim.prizeCode) continue;
    const center = ((start + prize.weight / 2) / coins.policy.totalWeight) * 360;
    return 1440 + (360 - center);
  }
  return 0;
}

export function DailyCheckInWheel({
  coins,
  active,
  busy,
  identityKey,
  unresolvedDay,
  onCheckIn,
}: {
  coins: CoinView;
  active: boolean;
  busy: boolean;
  identityKey: string;
  unresolvedDay: string | null;
  onCheckIn(retryOriginal?: boolean): Promise<CheckInOutcome | null>;
}) {
  const titleId = useId();
  const reducedMotion = useReducedMotion();
  const actionRun = useRef(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<WheelPhase>("idle");
  const [claim, setClaim] = useState<DailyCheckInClaim | null>(coins.claim);
  const [statusMessage, setStatusMessage] = useState("");
  const [rotation, setRotation] = useState(0);
  const resetKey = identityKey;
  const previousResetKey = useRef(resetKey);
  const background = useMemo(() => wheelBackground(coins), [coins]);
  const canShowWheel =
    coins.policy.prizes.length > 0 && (!claim || claim.policyVersion === coins.policy.version);
  const wheelStyle: WheelStyle = {
    "--wheel-rotation": `${rotation}deg`,
    "--wheel-target-rotation": `${rotation}deg`,
    background,
  };

  useEffect(() => {
    if (!open) return;
    restoreFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => restoreFocus.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) setClaim(coins.claim);
  }, [coins.claim, open]);

  useEffect(() => {
    if (previousResetKey.current === resetKey) return;
    previousResetKey.current = resetKey;
    actionRun.current += 1;
    setOpen(false);
    setPhase("idle");
    setClaim(null);
    setStatusMessage("");
    setRotation(0);
  }, [resetKey]);

  function trapDialogFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      closeDialog();
      return;
    }
    if (event.key !== "Tab" || !dialogRef.current) return;
    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute("disabled"));
    if (!focusable.length) {
      event.preventDefault();
      dialogRef.current.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (
      event.shiftKey &&
      (document.activeElement === first || document.activeElement === dialogRef.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function closeDialog() {
    actionRun.current += 1;
    setOpen(false);
    setPhase("idle");
    setStatusMessage("");
  }

  async function startCheckIn(retryOriginal = false) {
    const run = actionRun.current + 1;
    actionRun.current = run;
    setOpen(true);
    setClaim(null);
    setStatusMessage("");
    setRotation(0);
    setPhase("confirming");
    const outcome = await onCheckIn(retryOriginal);
    if (actionRun.current !== run) return;
    if (!outcome?.claim) {
      setStatusMessage(outcome?.message ?? "簽到請求未確認；目前沒有可顯示的入帳結果。");
      setPhase(
        outcome?.state === "rejected"
          ? "rejected"
          : outcome?.state === "pending"
            ? "pending"
            : "unknown",
      );
      return;
    }
    setClaim(outcome.claim);
    const target = targetRotation(coins, outcome.claim);
    if (
      outcome.claim.policyVersion !== coins.policy.version ||
      outcome.replayed ||
      outcome.recovered ||
      reducedMotion
    ) {
      setRotation(target);
      setPhase("result");
      return;
    }
    setRotation(target);
    setPhase("spinning");
  }

  function openResult() {
    setClaim(coins.claim);
    setStatusMessage("");
    if (coins.claim) setRotation(targetRotation(coins, coins.claim));
    setPhase(coins.claim ? "result" : "unknown");
    setOpen(true);
  }

  return (
    <section className={`membership-coins ${styles.card}`} aria-labelledby="daily-check-in-title">
      <h2 id="daily-check-in-title">每日簽到</h2>
      <p className="coin-balance">
        <strong>{coins.balance.toLocaleString("zh-TW")}</strong> Coin
      </p>
      <p className={`expense-hint ${styles.summary}`}>
        每日簽到轉盤 · 台灣時間 00:00 換日 · 今日 {coins.day}
      </p>
      <h3 className={styles.rewardTitle}>今日獎勵</h3>
      <ul className={styles.policy} aria-label="今日轉盤機率">
        {coins.policy.prizes.map((prize) => (
          <li key={prize.code}>
            <span>{coinText(prize.amount)}</span>
            <strong>
              {((prize.weight / coins.policy.totalWeight) * 100).toLocaleString("zh-TW")}%
            </strong>
          </li>
        ))}
      </ul>
      {active ? (
        coins.claimedToday ? (
          <button disabled={busy} onClick={openResult}>
            查看今日簽到結果
          </button>
        ) : (
          <button disabled={busy} onClick={() => void startCheckIn()}>
            {unresolvedDay ? `讀取 ${unresolvedDay} 簽到結果` : "簽到並轉動轉盤"}
          </button>
        )
      ) : (
        <p>會員啟用後即可每日簽到。</p>
      )}
      {unresolvedDay && !coins.claimedToday && (
        <p className="expense-hint">{unresolvedDay} 的簽到尚未確認；此按鈕只會讀取原簽到結果。</p>
      )}
      {coins.claimedToday && (
        <p className="expense-hint">{resultText(coins.claim, coins)} 隔日可重新整理狀態後簽到。</p>
      )}
      {open && (
        <div className={styles.overlay}>
          <div
            aria-labelledby={titleId}
            aria-modal="true"
            className={styles.dialog}
            onKeyDown={trapDialogFocus}
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <h3 id={titleId}>每日簽到轉盤</h3>
            {canShowWheel && (
              <div
                aria-label={
                  claim ? `轉盤結果 ${prizeDescription(coins, claim.prizeCode)}` : "每日簽到轉盤"
                }
                className={styles.wheelFrame}
                role="img"
              >
                <div className={styles.pointer} />
                <div
                  className={styles.wheel}
                  data-prize-code={claim?.prizeCode}
                  data-spinning={phase === "spinning" ? "true" : undefined}
                  onAnimationEnd={() => {
                    if (phase === "spinning") setPhase("result");
                  }}
                  style={wheelStyle}
                />
                <div className={styles.wheelCenter}>Coin</div>
              </div>
            )}
            <ul className={styles.wheelLegend} aria-label="轉盤獎項對照">
              {coins.policy.prizes.map((prize, index) => (
                <li key={prize.code}>
                  <span
                    className={styles.legendColor}
                    style={{ background: colors[index % colors.length] }}
                  />
                  <span>{coinText(prize.amount)}</span>
                  <strong>
                    {((prize.weight / coins.policy.totalWeight) * 100).toLocaleString("zh-TW")}%
                  </strong>
                </li>
              ))}
            </ul>
            {phase === "confirming" && <p role="status">正在確認今日簽到結果…</p>}
            {phase === "spinning" && <p role="status">結果已確認，轉盤正在停靠。</p>}
            {(phase === "result" ||
              phase === "pending" ||
              phase === "rejected" ||
              phase === "unknown") && (
              <p className={styles.result} role="status">
                {statusMessage || resultText(claim, coins)}
                {claim && <strong>{coinText(claim.reward)}</strong>}
              </p>
            )}
            {claim && claim.policyVersion !== coins.policy.version && (
              <p className="expense-hint">這筆結果來自不同獎勵版本，因此只顯示文字結果。</p>
            )}
            <div className={styles.actions}>
              {phase === "pending" && unresolvedDay && (
                <button disabled={busy} onClick={() => void startCheckIn(true)}>
                  重新送出原日簽到
                </button>
              )}
              {(phase === "pending" || phase === "unknown") && (
                <button disabled={busy} onClick={() => void startCheckIn()}>
                  讀取原簽到結果
                </button>
              )}
              <button className={styles.secondaryAction} onClick={closeDialog}>
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
