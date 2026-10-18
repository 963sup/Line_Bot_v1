# Object Web surface

`/{login}/{repository}/objects` presents the Object owner contract. Repository locators only
select current scope; verified LINE identity maps to an active User and every read/write is
authorized again by the owning package. Object, Object Type and Object Relationship remain
`@line_bot_v1/object` facts.

The browser retains an unresolved command only for exact retry with the original request ID,
payload and expected version. Identity/session changes clear private state. Content is rendered
as escaped plain text. Cross-context references remain owned by their consumer.
