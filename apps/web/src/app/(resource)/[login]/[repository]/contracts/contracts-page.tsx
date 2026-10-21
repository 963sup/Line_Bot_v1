"use client";
import { useState } from "react";
import ContractsPanel from "../../../../../modules/contract/contracts-panel";
import RepositoryPageHeader from "../../../../../modules/repository/repository-page-header";
export default function ContractsPage(props: {
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
        active="contracts"
        canManage={canManage}
      />
      <ContractsPanel {...props} onCanManageChange={setCanManage} />
    </>
  );
}
