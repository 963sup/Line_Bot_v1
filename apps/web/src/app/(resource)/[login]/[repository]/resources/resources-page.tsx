"use client";
import { useState } from "react";
import RepositoryPageHeader from "../../../../../modules/repository/repository-page-header";
import ResourcesPanel from "../../../../../modules/resources/resources-panel";
export default function ResourcesPage(props: {
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
        active="resources"
        canManage={canManage}
      />
      <ResourcesPanel {...props} onCanManageChange={setCanManage} />
    </>
  );
}
