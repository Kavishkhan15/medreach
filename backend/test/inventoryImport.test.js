import test from "node:test";
import assert from "node:assert/strict";
import { parseInventoryCsv, RESOURCE_CATALOGUE } from "../src/services/inventoryImport.js";
const header = "resourceKey,unit,capacity,occupied,blocked,held,observedAt,expectedVersion";
const now = new Date("2026-10-26T12:00:00Z");
const row = "general_beds,beds,50,5,0,0,2026-10-26T11:59:00Z,0";
test("CSV import preserves unknown versus zero and uses the inventory validation contract", () => {
  const [record] = parseInventoryCsv(`${header}\n${row}`, "hospital", now);
  assert.equal(record.input.capacity, 50); assert.equal(record.input.held, 0);
  assert.equal(record.resourceKey, "general_beds");
  const [unknown] = parseInventoryCsv(`${header}\ngeneral_beds,beds,50,,0,0,2026-10-26T11:59:00Z,0`, "hospital", now);
  assert.equal(unknown.input.occupied, null);
  assert.ok(RESOURCE_CATALOGUE.hospital.some(resource => resource.key === "nicu_beds"));
});
test("CSV import rejects forged fields, duplicates, formulas, stale time and inconsistent capacity", () => {
  for (const csv of [`${header},organizationId\n${row},forged`, `${header}\n${row}\n${row}`, `${header}\n${row.replace(',50,', ',=SUM(50),')}`, `${header}\n${row.replace(',5,', ',51,')}`, `${header}\n${row.replace('11:59', '10:59')}`, `${header}\n${row.replace('beds,50', 'units,50')}`]) {
    assert.throws(() => parseInventoryCsv(csv, "hospital", now));
  }
  assert.throws(() => parseInventoryCsv(`${header}\n${row}`, "ambulance", now));
  assert.throws(() => parseInventoryCsv(`${header}\n${row}\n`, "invented", now));
});
test("CSV import handles quoted fields and CRLF with bounded payloads", () => {
  assert.equal(parseInventoryCsv(`${header}\r\n"general_beds",beds,50,5,0,0,2026-10-26T11:59:00Z,0\r\n`, "hospital", now).length, 1);
  assert.throws(() => parseInventoryCsv(`${header}\n"unclosed`, "hospital", now));
  assert.throws(() => parseInventoryCsv("x".repeat(65537), "hospital", now));
});
