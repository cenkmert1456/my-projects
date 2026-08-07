import { internalMutation } from "./_generated/server";
import { PLAN_DEFS } from "./lib/constants";

/** Seed the plans catalog. Limits live in the DB so they can be tuned later. */
export const seedPlans = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("plans").first();
    if (existing) return { seeded: 0 };
    let count = 0;
    for (const plan of PLAN_DEFS) {
      await ctx.db.insert("plans", {
        planId: plan.id,
        name: plan.name,
        priceMonthly: plan.priceMonthly,
        priceYearly: plan.priceYearly,
        currency: plan.currency,
        dropLimit: plan.dropLimit ?? undefined,
        features: plan.features,
      });
      count++;
    }
    return { seeded: count };
  },
});
