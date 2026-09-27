# @line-work/repository

- Owns Repository identity/access/star, Label, Repository Milestone, Issue/IssueLabel, Discussion/comment and their lifecycle/command evidence.
- Issues, Discussions, Labels and Repository Milestones are distinct Repository-owned objects; Project Milestone is a different Project-owned concept.
- Repository scope, assignment qualification, lifecycle transition, expected version and request replay are validated by this owner.
- Events/history are durable evidence; retries are idempotent and corrections do not silently rewrite prior event meaning.
- HTTP, LINE and Assistant entrypoints use owner public contracts and do not mutate Repository relations directly.
- Owner login/repository name/issue number/milestone number are locators only. Protected reads and writes still resolve stable IDs and current access before exposing private data.
- Current read APIs do not imply every GitHub-like write capability is active. Do not let Discussion, Label, Milestone or Project naming similarity move behavior out of the Repository owner or claim runtime completion without tests and topology/docs evidence.

- Runtime mutation authority follows activated capabilities, not table existence. Current writes are Issue create/transition (including `next_issue_number` allocation) and Repository star/unstar; access grants, Discussion/Comment, Label, Repository Milestone and IssueLabel management remain data-only/read-only until a real command consumer is activated.
