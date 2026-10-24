"use client";
import { useState } from "react";
import FilesPanel from "../../../../../modules/file/files-panel";
import RepositoryPageHeader from "../../../../../modules/repository/repository-page-header";
import { repositoryContentPath } from "../../../../../modules/repository/resource-navigation";

export default function FilesPage(props: {
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
        active="files"
        canManage={canManage}
      />
      <FilesPanel
        key={`${props.ownerLogin}/${props.repositoryName}`}
        {...props}
        contentPath={repositoryContentPath(props.ownerLogin, props.repositoryName)}
        onCanManageChange={setCanManage}
      />
    </>
  );
}
