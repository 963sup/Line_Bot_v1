import assert from "node:assert/strict";
import test from "node:test";
import { projectProgressOptions, suggestedProgressName } from "../src/application/progress.js";

test("Project progress policy supplies stable options and avoids field name collisions", () => {
  assert.deepEqual(projectProgressOptions, [
    { name: "待處理", color: "GRAY", description: "尚未開始" },
    { name: "進行中", color: "BLUE", description: "正在處理" },
    { name: "已完成", color: "GREEN", description: "已完成" },
  ]);
  assert.equal(suggestedProgressName([]), "工作進度");
  assert.equal(suggestedProgressName([{ name: "工作進度" }]), "工作進度 2");
  assert.equal(suggestedProgressName([{ name: " 工作進度 2 " }]), "工作進度");
  assert.equal(suggestedProgressName([{ name: "工作進度" }, { name: "工作進度 2" }]), "工作進度 3");
});
