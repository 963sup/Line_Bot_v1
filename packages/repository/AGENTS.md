# @line-work/repository

- Owns Repository identity/access/star, Label, Repository Milestone, Issue/IssueLabel, Discussion/comment and their lifecycle/command evidence.
- Issues, Discussions, Labels and Repository Milestones are distinct Repository-owned objects; Project Milestone is a different Project-owned concept.
- Repository scope, assignment qualification, lifecycle transition, expected version and request replay are validated by this owner.
- Events/history are durable evidence; retries are idempotent and corrections do not silently rewrite prior event meaning.
- HTTP, LINE and Assistant entrypoints use owner public contracts and do not mutate Repository relations directly.
