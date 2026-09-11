import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReportQuery,
  canReadReports,
} from "../src/lib/workspace/report-query.ts";

test("Reports require reports.read, not reports.basic or reports.advanced", () => {
  assert.equal(canReadReports(["reports.basic"]), false);
  assert.equal(canReadReports(["reports.advanced"]), false);
  assert.equal(canReadReports(["reports.read"]), true);
});

test("Report query preserves active branch, timezone and requested date range", () => {
  const query = new URLSearchParams(
    buildReportQuery(
      {
        organizationId: "org-1",
        branchId: "branch-2",
        timeZone: "Africa/Accra",
      },
      {
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-09-07T23:59:59.000Z",
      },
    ),
  );

  assert.equal(query.get("branchId"), "branch-2");
  assert.equal(query.get("timezone"), "Africa/Accra");
  assert.equal(query.get("from"), "2026-09-01T00:00:00.000Z");
  assert.equal(query.get("to"), "2026-09-07T23:59:59.000Z");
  assert.equal(query.get("limit"), "100");
});
