# Transitional authenticated resource route group

本 group 不再擁有一般 mobile application surface。Home、Inbox、Explore、AI、Attendance、Repositories collection、Settings 與其他 authenticated mobile work surfaces 已移至 sibling `(mobile)`。

目前只保留 Repository-scoped Issue / Discussion / Label / Milestone 子資源與舊 mobile shell，作為 migration evidence。它們的 canonical resource hierarchy 最終應與 `(resource)/[login]/[repository]` 收斂；在 direct-open、public/private resolution、authorization、resource header 與 back-navigation 核對完成前，不以目錄對稱直接搬移。

- 不新增新的 `(app)` route。
- 不把 `(app)` 當成新的 architecture owner。
- Repository 子資源仍由 Repository business owner 決定 semantics/authorization。
- 舊 shell 只服務尚未遷移的 Repository 子資源；不得增加新 navigation responsibility。
- 新 Mobile 主目的地與 shell 以 `(mobile)/AGENTS.md` 為準。
