"use client";
import { useState } from "react";
import ContentPanel from "../../../../../modules/content/content-panel";
import RepositoryPageHeader from "../../../../../modules/repository/repository-page-header";
import { repositoryContractsPath } from "../../../../../modules/repository/resource-navigation";
export default function ContentPage(props: {
  liffId: string;
  ownerLogin: string;
  repositoryName: string;
}) {
  const [canManage, setCanManage] = useState(false);
  return (
    <>
      <RepositoryPageHeader
        ownerLogin={props.ownerLogin}
        repositoryName={props.repositoryName}
        active="content"
        canManage={canManage}
      />
      <ContentPanel
        {...props}
        contractsPath={repositoryContractsPath(props.ownerLogin, props.repositoryName)}
        onCanManageChange={setCanManage}
      />
    </>
  );
}
