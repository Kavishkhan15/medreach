# Status Note: Existing Healthcare Platforms Comparison

**Worker**: Existing Platforms Research Specialist (`worker-platforms-comparison`)  
**Date**: 2026-10-23  
**Status**: Completed  

### Deliverables Produced
I authored `/home/anonymous/medreach/docs/research/medreach-healthcare-access/02-existing-platforms-comparison.md` and archived 17 raw empirical measurements under `/home/anonymous/medreach/research-measurements/existing-platforms/`. The audit profiles eight national and regional platforms against a five-tier operational taxonomy (Directory, Service Offered, Reported Available, Confirmed Currently Available, Completed Request):
1. **BMC Citizen Health Portal (`bmchealth.in`)**: Angular SPA; REST API returns static sanctioned bed capacities (KEM: 1800, Nair: 2004, Cooper: 603) and empty blood bank links (Tier 1/2).
2. **e-RaktKosh (`eraktkosh.mohfw.gov.in`)**: React SPA; live component-level inventory with explicit `entrydate` timestamps (Cooper Hospital: 2026-10-23 06:13:36; JJ Hospital: 2026-10-23 08:43:13), but lacks reservation locks (Tier 3).
3. **ABDM HFR (`abdm.gov.in`)**: Authoritative facility registry and service catalog; no live bed or blood vacancy tracking (Tier 1/2).
4. **BMC COVID-19 Ward War Rooms**: Verified historical Tier 4/5 statutory allocation monopoly; decommissioned post-crisis (`stopcoronavirus.mcgm.gov.in` DNS inactive).
5. **SBTC Maharashtra & MEMS 108**: Informational Appsmith blood stock; 108 handles Tier 5 CAD transport but lacks hospital bed reservation integration.
6. **CoWIN & Private Aggregators**: CoWIN achieved Tier 5 for scheduled vaccines; aggregators (Practo, Apollo) support OPD appointments but live inpatient bed tracking is unobserved.

### Unverified Items
1. Internal MCGM HMIS (`hmis.mcgm.gov.in`) inpatient transfer screens (requires civic staff credentials).
2. UHI live production schema for emergency bed allocation.
3. Peacetime willingness of private corporate hospitals to share ICU occupancy without statutory mandates.

### Orchestrator Decisions
1. Confirm whether MedReach should prioritize bridging e-RaktKosh Tier 3 data or implement a closed-loop Tier 4 reservation workflow modeled after the BMC crisis war rooms.
2. Decide whether to include private hospital casualty offload delay metrics in the benchmark methodology.
