import { lineMiniApp } from "@line_bot_v1/line/mini-app";
import { normalizeAccountLogin } from "@line_bot_v1/namespace";
import { notFound } from "next/navigation";
import RepositoryManagementSettings from "../../../../../modules/repository/repository-management-settings";
import styles from "../../../../../modules/repository/repository-resource.module.css";
import RepositorySettings from "../../../../../modules/repository/repository-settings";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ login: string; repository: string }>;
}) {
  const { login, repository } = await params;
  let ownerLogin: string;
  try {
    ownerLogin = normalizeAccountLogin(login);
  } catch {
    notFound();
  }
  return (
    <>
      <RepositoryManagementSettings
        liffId={lineMiniApp().liffId}
        ownerLogin={ownerLogin}
        repositoryName={repository}
      />
      <div className={styles.settingsSection}>
        <RepositorySettings
          liffId={lineMiniApp().liffId}
          mapsApiKey={process.env.GOOGLE_MAPS_API_KEY?.trim() ?? ""}
          ownerLogin={ownerLogin}
          repositoryName={repository}
        />
      </div>
    </>
  );
}
