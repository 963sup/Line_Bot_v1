# Browser shared boundary

- Browser code is presentation/runtime support and must remain free of server credentials, private database access and business authority.
- LIFF/session/navigation state is untrusted intent; server routes re-establish Principal, scope, permission, version and replay authority.
- Preserve abort/mounted guards, stale-response rejection, safe URL handling and browser/server dependency separation.
