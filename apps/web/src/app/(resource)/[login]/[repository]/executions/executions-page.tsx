"use client";
import { useState } from "react";
import ExecutionsPanel from "../../../../../modules/execution/executions-panel";
import RepositoryPageHeader from "../../../../../modules/repository/repository-page-header";
export default function ExecutionsPage(props: {
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
        active="executions"
        canManage={canManage}
      />
      <ExecutionsPanel {...props} onCanManageChange={setCanManage} />
    </>
  );
}
