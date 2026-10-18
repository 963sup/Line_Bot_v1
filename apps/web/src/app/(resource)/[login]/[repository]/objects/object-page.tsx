"use client";

import { useState } from "react";
import ObjectPanel from "../../../../../modules/object/object-panel";
import RepositoryPageHeader from "../../../../../modules/repository/repository-page-header";

export default function ObjectPage({
  liffId,
  ownerLogin,
  repositoryName,
  objectId,
  basePath,
}: {
  liffId: string;
  ownerLogin: string;
  repositoryName: string;
  objectId?: string;
  basePath: string;
}) {
  const [canManage, setCanManage] = useState(false);
  return (
    <>
      <RepositoryPageHeader
        ownerLogin={ownerLogin}
        repositoryName={repositoryName}
        active="objects"
        canManage={canManage}
        title={objectId ? "Object" : "Objects"}
      />
      <ObjectPanel
        liffId={liffId}
        ownerLogin={ownerLogin}
        repositoryName={repositoryName}
        {...(objectId ? { objectId } : {})}
        basePath={basePath}
        onCanManageChange={setCanManage}
      />
    </>
  );
}
