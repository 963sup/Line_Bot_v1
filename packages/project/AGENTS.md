# Project

- Owns Project identity/access, cross-Repository planning, WBS ordering, Project Milestone state, and stable references to Repository work.
- Project does not own Repository Issue content/lifecycle or Repository access; references must preserve Repository authority.
- Project is not WBS: WBS is Project-owned work decomposition, not the Project management boundary itself.
- This workspace/module owner currently has no runtime source or public export. Do not add empty layers, adapters, contracts, or dependencies for symmetry alone.
- If a real runtime consumer activates Project capabilities, add only the required public contracts/source and update tests plus canonical docs in the same change.
- Project references Repository work by stable Repository-owned identity. It must not copy Issue/Discussion lifecycle, Repository access, labels, milestones or source history into a second authority.
- Runtime activation must define Project access/authorization, expected version, replay identity, reference integrity and a real consumer before adding schema writers or public exports.
