/** UI-only navigation intent; source and Project authorization are always checked independently. */
export type ContractWbsHandoff = Readonly<{
  contractOwner: string;
  contractRepository: string;
  contractId: string;
  contractRevisionId: string;
}>;

const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function parseContractWbsHandoff(query: URLSearchParams): ContractWbsHandoff | null {
  const contractOwner = query.get("contractOwner") ?? "";
  const contractRepository = query.get("contractRepository") ?? "";
  const contractId = query.get("contractId") ?? "";
  const contractRevisionId = query.get("contractRevisionId") ?? "";
  if (
    !contractOwner ||
    contractOwner.length > 128 ||
    contractOwner !== contractOwner.trim() ||
    !contractRepository ||
    contractRepository.length > 128 ||
    contractRepository !== contractRepository.trim() ||
    !uuid.test(contractId) ||
    !uuid.test(contractRevisionId)
  )
    return null;
  return { contractOwner, contractRepository, contractId, contractRevisionId };
}

export function contractWbsHandoffSearch(source: ContractWbsHandoff): string {
  return new URLSearchParams({
    contractOwner: source.contractOwner,
    contractRepository: source.contractRepository,
    contractId: source.contractId,
    contractRevisionId: source.contractRevisionId,
  }).toString();
}
