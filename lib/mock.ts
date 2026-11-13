// MOCK DATA for the clickable mockup only. NOT real. Replace with lib/queries.ts
// (Supabase) once data/schedule.csv + data/streets.csv are loaded.
// Shapes match contracts/api.md so the swap is a one-line import change.

export type Street = { id: number; area_id: number; name: string; lat: number; lng: number; order_index: number };
export type Window = { day: string; start_time: string; end_time: string; source_url: string; source_date: string };

export const MOCK_AREA = { id: 1, name: "Mock Village" };

export const MOCK_STREETS: Street[] = [
  { id: 1, area_id: 1, name: "Street 1 (mock)", lat: -20.2410, lng: 57.4950, order_index: 1 },
  { id: 2, area_id: 1, name: "Street 2 (mock)", lat: -20.2440, lng: 57.4985, order_index: 2 },
  { id: 3, area_id: 1, name: "Street 3 (mock)", lat: -20.2475, lng: 57.5010, order_index: 3 },
  { id: 4, area_id: 1, name: "Street 4 (mock)", lat: -20.2505, lng: 57.5040, order_index: 4 },
  { id: 5, area_id: 1, name: "Street 5 (mock)", lat: -20.2540, lng: 57.5070, order_index: 5 },
];

export const MOCK_WINDOW: Window = {
  day: "Today",
  start_time: "05:00",
  end_time: "09:00",
  source_url: "#",
  source_date: "2026-11-13",
};

// op 10: reliability per street; op 11: hours since last water_on
export const MOCK_RELIABILITY = { onTime: 4, days: 7 };
export const MOCK_HOURS_DRY: Record<number, number> = { 1: 2, 2: 7, 3: 15, 4: 30, 5: 50 };
