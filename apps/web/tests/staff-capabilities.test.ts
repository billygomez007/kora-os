import assert from "node:assert/strict";
import test from "node:test";
import {
  staffCapabilities,
  staffDetailRequestPlan,
  staffRequestPlan,
} from "../src/lib/workspace/staff-capabilities.ts";

test("Staff capabilities are derived from permission codes, not role names", () => {
  const capabilities = staffCapabilities([
    "staff.read",
    "availability.read",
    "services.read",
  ]);

  assert.deepEqual(capabilities, {
    canReadStaff: true,
    canInviteStaff: false,
    canReadAvailability: true,
    canManageAvailability: false,
    canReadServices: true,
    canManageServices: false,
  });
});

test("Staff request plan suppresses unauthorized directory and invite reads", () => {
  assert.deepEqual(staffRequestPlan(staffCapabilities([])), []);
  assert.deepEqual(
    staffRequestPlan(staffCapabilities(["staff.read"])),
    ["directory", "invitations"],
  );
  assert.deepEqual(
    staffRequestPlan(staffCapabilities(["staff.invite"])),
    ["assignable-roles", "branches"],
  );
});

test("Staff management and read-only capabilities stay separate", () => {
  const readOnly = staffCapabilities([
    "staff.read",
    "availability.read",
    "services.read",
  ]);
  const manager = staffCapabilities([
    "staff.read",
    "staff.invite",
    "availability.read",
    "availability.manage",
    "services.read",
    "services.manage",
  ]);

  assert.equal(readOnly.canManageAvailability, false);
  assert.equal(readOnly.canManageServices, false);
  assert.equal(manager.canManageAvailability, true);
  assert.equal(manager.canManageServices, true);
});

test("Staff detail suppresses availability reads without availability.read", () => {
  const readOnly = staffCapabilities(["staff.read"]);
  const availabilityReader = staffCapabilities(["staff.read", "availability.read"]);

  assert.deepEqual(staffDetailRequestPlan(readOnly, true), []);
  assert.deepEqual(staffDetailRequestPlan(availabilityReader, false), []);
  assert.deepEqual(staffDetailRequestPlan(availabilityReader, true), ["availability"]);
});
