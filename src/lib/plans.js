export const PLAN_ORDER = ["free", "pro", "ultra"];

export const PLAN_META = {
  free:  { id: "free",  name: "Free",  price: "₹0",   amount: 0,   period: "",       color: "#333"    },
  pro:   { id: "pro",   name: "Pro",   price: "₹99",  amount: 99,  period: "/month", color: "#a78bfa" },
  ultra: { id: "ultra", name: "Ultra", price: "₹249", amount: 249, period: "/month", color: "#67e8f9" },
};

export const MODEL_LIMIT_FIELDS = [
  { key: "Milkcake 2.7", short: "Milkcake", color: "#a78bfa" },
  { key: "Astral 2.0",   short: "Astral",   color: "#67e8f9" },
  { key: "Impulse 1.4",  short: "Impulse",  color: "#86efac" },
  { key: "Cornea 1.0",   short: "Cornea",   color: "#fca5a5" },
  { key: "Nova 1.0",     short: "Nova",     color: "#fde68a" },
  { key: "Spark 1.0",    short: "Spark",    color: "#fb923c" },
];

export const DEFAULT_PLAN_LIMITS = {
  free:  { "Milkcake 2.7": 3,        "Astral 2.0": 10,       "Impulse 1.4": 30,       "Cornea 1.0": 5,        "Nova 1.0": 10,       "Spark 1.0": 50       },
  pro:   { "Milkcake 2.7": 30,       "Astral 2.0": 75,       "Impulse 1.4": 300,      "Cornea 1.0": 50,       "Nova 1.0": 75,       "Spark 1.0": 500      },
  ultra: { "Milkcake 2.7": Infinity, "Astral 2.0": Infinity, "Impulse 1.4": Infinity, "Cornea 1.0": Infinity, "Nova 1.0": Infinity, "Spark 1.0": Infinity },
};

const UNLIMITED_VALUES = new Set(["", "inf", "infinity", "unlimited", "∞"]);

export const normalizePlanLimits = (value = {}) => {
  const normalized = {};
  for (const planId of PLAN_ORDER) {
    normalized[planId] = {};
    for (const { key } of MODEL_LIMIT_FIELDS) {
      const fallback = DEFAULT_PLAN_LIMITS[planId][key];
      const raw = value?.[planId]?.[key];
      if (typeof raw === "string" && UNLIMITED_VALUES.has(raw.trim().toLowerCase())) { normalized[planId][key] = Infinity; continue; }
      if (raw === null || raw === undefined || raw === "") { normalized[planId][key] = fallback === Infinity ? Infinity : fallback; continue; }
      const next = Number(raw);
      normalized[planId][key] = Number.isFinite(next) && next >= 0 ? next : fallback;
    }
  }
  return normalized;
};

export const serializePlanLimits = (limits = DEFAULT_PLAN_LIMITS) => {
  const normalized = normalizePlanLimits(limits);
  const serialized = {};
  for (const planId of PLAN_ORDER) {
    serialized[planId] = {};
    for (const { key } of MODEL_LIMIT_FIELDS) {
      const value = normalized[planId][key];
      serialized[planId][key] = value === Infinity ? null : value;
    }
  }
  return serialized;
};

export const buildPlanCards = (limits = DEFAULT_PLAN_LIMITS) => {
  const normalized = normalizePlanLimits(limits);
  return PLAN_ORDER.map((planId) => ({
    ...PLAN_META[planId],
    features: MODEL_LIMIT_FIELDS.map(({ key, short }) => {
      const limit = normalized[planId][key];
      return limit === Infinity ? `Unlimited ${short}` : `${limit} ${short}/day`;
    }),
  }));
};

export const limitInputValue = (value) => (value === Infinity ? "" : String(value));

export const calculatePlanExpiry = (days) => {
  const numericDays = Math.max(1, Number(days) || 30);
  return new Date(Date.now() + (numericDays * 24 * 60 * 60 * 1000));
};