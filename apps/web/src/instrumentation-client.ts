import { startLineMiniAppBoot } from "./shared/browser/liff-bootstrap";
import { hasEntryContinuation } from "./shared/presentation/entry-destination";

if (hasEntryContinuation(location.href)) startLineMiniAppBoot();
