export interface ReportQueryContext {
  organizationId: string;
  branchId: string;
  timeZone: string;
}

export function buildReportQuery(
  context: ReportQueryContext,
  dates: { from: string; to: string },
): string {
  return new URLSearchParams({
    from: dates.from,
    to: dates.to,
    branchId: context.branchId,
    timezone: context.timeZone,
    limit: "100",
  }).toString();
}

export function canReadReports(permissionCodes: string[]): boolean {
  return permissionCodes.includes("reports.read");
}
