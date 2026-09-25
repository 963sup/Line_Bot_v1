import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeading({
  title,
  description,
  back,
  actions,
}: {
  title: string;
  description?: string;
  back?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div className="page-heading-copy">
        {back && (
          <Link className="back-link" href={back}>
            ← 返回
          </Link>
        )}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-heading-actions">{actions}</div>}
    </div>
  );
}

export function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
  );
}

export function PrimaryLink({
  href,
  children,
  tone = "primary",
}: {
  href: string;
  children: ReactNode;
  tone?: "primary" | "secondary";
}) {
  return (
    <Link className={`button-link button-link-${tone}`} href={href}>
      {children}
    </Link>
  );
}

export function PageState({
  title,
  children,
  action,
  tone = "empty",
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  tone?: "empty" | "error" | "loading" | "restricted";
}) {
  return (
    <section
      className={`page-state page-state-${tone}`}
      role={tone === "error" ? "alert" : tone === "loading" ? "status" : undefined}
    >
      <span className="state-symbol" aria-hidden="true">
        {tone === "error" ? "!" : tone === "loading" ? "…" : "◇"}
      </span>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </section>
  );
}

export function ActionRow({
  href,
  title,
  description,
  icon,
  tone = "neutral",
}: {
  href: string;
  title: string;
  description?: string;
  icon?: string;
  tone?: "neutral" | "green" | "blue" | "purple" | "orange" | "yellow" | "pink";
}) {
  return (
    <Link className="action-row" href={href}>
      {icon && (
        <span className={`action-row-icon action-row-icon-${tone}`} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="action-row-copy">
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </span>
      <span className="action-chevron" aria-hidden="true">
        ›
      </span>
    </Link>
  );
}

export function StatusRow({
  title,
  description,
  status,
  icon,
  tone = "neutral",
}: {
  title: string;
  description?: string;
  status: string;
  icon?: string;
  tone?: "neutral" | "green" | "blue" | "purple" | "orange" | "yellow" | "pink";
}) {
  return (
    <div className="action-row status-row" role="note">
      {icon && (
        <span className={`action-row-icon action-row-icon-${tone}`} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="action-row-copy">
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </span>
      <span className="row-status">{status}</span>
    </div>
  );
}
