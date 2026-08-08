import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// ---------------------------------------------------------------------------
// DROP data model
// ---------------------------------------------------------------------------

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

const entityValidator = v.object({
  type: v.string(),
  value: v.string(),
  confidence: v.number(),
  metadata: v.optional(v.record(v.string(), v.string())),
});

const productValidator = v.object({
  name: v.optional(v.string()),
  brand: v.optional(v.string()),
  price: v.optional(v.number()),
  currency: v.optional(v.string()),
  store: v.optional(v.string()),
  productUrl: v.optional(v.string()),
  category: v.optional(v.string()),
  variant: v.optional(v.string()),
  color: v.optional(v.string()),
  size: v.optional(v.string()),
});

const placeValidator = v.object({
  name: v.optional(v.string()),
  city: v.optional(v.string()),
  country: v.optional(v.string()),
  address: v.optional(v.string()),
  category: v.optional(v.string()),
  source: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
});

const eventValidator = v.object({
  name: v.optional(v.string()),
  startTime: v.optional(v.number()),
  endTime: v.optional(v.number()),
  location: v.optional(v.string()),
  url: v.optional(v.string()),
});

const receiptValidator = v.object({
  merchant: v.optional(v.string()),
  purchaseDate: v.optional(v.number()),
  items: v.optional(v.array(v.string())),
  total: v.optional(v.number()),
  currency: v.optional(v.string()),
  paymentMethod: v.optional(v.string()),
  orderNumber: v.optional(v.string()),
  returnDeadline: v.optional(v.number()),
  warrantyUntil: v.optional(v.number()),
});

const reservationValidator = v.object({
  type: v.optional(v.string()),
  reference: v.optional(v.string()),
  provider: v.optional(v.string()),
  startTime: v.optional(v.number()),
  endTime: v.optional(v.number()),
  location: v.optional(v.string()),
  details: v.optional(v.string()),
});

const flightValidator = v.object({
  airline: v.optional(v.string()),
  flightNumber: v.optional(v.string()),
  departure: v.optional(v.string()),
  destination: v.optional(v.string()),
  departureTime: v.optional(v.number()),
  arrivalTime: v.optional(v.number()),
  bookingReference: v.optional(v.string()),
});

const suggestedReminderValidator = v.object({
  text: v.string(),
  at: v.optional(v.number()),
});

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove

      // DROP-specific profile & settings
      onboardingDone: v.optional(v.boolean()),
      plan: v.optional(v.string()), // free | pro | family
      planStatus: v.optional(v.string()), // trialing | active | canceled
      planRenewsAt: v.optional(v.number()),
      searchHistoryEnabled: v.optional(v.boolean()),
      dailyRecallEnabled: v.optional(v.boolean()),
      locale: v.optional(v.string()),
      theme: v.optional(v.string()),
      onboardedAt: v.optional(v.number()),
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // A Drop is anything the user saved: image, screenshot, link, note, document.
    drops: defineTable({
      userId: v.id("users"),
      kind: v.union(
        v.literal("image"),
        v.literal("screenshot"),
        v.literal("link"),
        v.literal("note"),
        v.literal("document"),
      ),
      // User-visible state
      title: v.string(),
      summary: v.optional(v.string()),
      category: v.string(),
      subcategory: v.optional(v.string()),
      keywords: v.array(v.string()),
      tags: v.array(v.string()),
      starred: v.optional(v.boolean()),
      archived: v.optional(v.boolean()),
      pinned: v.optional(v.boolean()),
      sensitive: v.optional(v.boolean()),
      notes: v.optional(v.string()),
      deletedAt: v.optional(v.number()), // soft-delete timestamp (trash)
      savedAt: v.number(), // user-perceived save time (ms epoch)

      // Processing state
      status: v.union(
        v.literal("processing"),
        v.literal("ready"),
        v.literal("needs_review"),
        v.literal("failed"),
      ),
      analysisStatus: v.union(
        v.literal("pending"),
        v.literal("processing"),
        v.literal("done"),
        v.literal("failed"),
      ),
      analysisVersion: v.optional(v.number()),
      confidence: v.optional(v.number()),

      // Content
      url: v.optional(v.string()),
      text: v.optional(v.string()), // note text
      ocrText: v.optional(v.string()),
      ocrLanguage: v.optional(v.string()),
      ocrEngine: v.optional(v.string()),
      searchText: v.optional(v.string()),
      source: v.optional(v.string()),
      sourceUrl: v.optional(v.string()),

      // Files (Convex storage, served via signed/private URLs)
      storageId: v.optional(v.string()),
      thumbnailStorageId: v.optional(v.string()),
      contentType: v.optional(v.string()),
      fileName: v.optional(v.string()),

      // AI analysis output
      language: v.optional(v.string()),
      sentiment: v.optional(v.string()),
      intent: v.optional(v.string()),
      entities: v.array(entityValidator),
      product: v.optional(productValidator),
      place: v.optional(placeValidator),
      event: v.optional(eventValidator),
      receipt: v.optional(receiptValidator),
      reservation: v.optional(reservationValidator),
      flight: v.optional(flightValidator),
      suggestedAction: v.optional(v.string()),
      suggestedReminder: v.optional(suggestedReminderValidator),

      // Semantic search
      embedding: v.optional(v.array(v.number())),
      embeddingProvider: v.optional(v.string()),
    })
      .index("by_user_savedAt", ["userId", "savedAt"])
      .index("by_user_category", ["userId", "category"])
      .index("by_user_status", ["userId", "status"])
      .index("by_user_archived", ["userId", "archived"])
      .index("by_url", ["userId", "url"]),

    // Manual + (future) shared collections. Magic collections are computed live.
    collections: defineTable({
      userId: v.id("users"),
      name: v.string(),
      emoji: v.optional(v.string()),
      color: v.optional(v.string()),
      description: v.optional(v.string()),
      isPublic: v.optional(v.boolean()),
      shareToken: v.optional(v.string()),
    }).index("by_user", ["userId"]),

    collectionDrops: defineTable({
      collectionId: v.id("collections"),
      dropId: v.id("drops"),
      userId: v.id("users"),
    })
      .index("by_collection", ["collectionId"])
      .index("by_drop", ["dropId"])
      .index("by_user", ["userId"]),

    reminders: defineTable({
      userId: v.id("users"),
      dropId: v.id("drops"),
      text: v.string(),
      remindAt: v.number(), // ms epoch
      status: v.union(
        v.literal("pending"),
        v.literal("completed"),
        v.literal("dismissed"),
      ),
    })
      .index("by_user_remindAt", ["userId", "remindAt"])
      .index("by_drop", ["dropId"]),

    searchHistory: defineTable({
      userId: v.id("users"),
      query: v.string(),
      resultCount: v.optional(v.number()),
    }).index("by_user", ["userId"]),

    // Stacks — active research/context groups (Collections are long-term;
    // Stacks are "Japan 2027", "New Gaming PC", "Camera Research").
    stacks: defineTable({
      userId: v.id("users"),
      name: v.string(),
      emoji: v.optional(v.string()),
      color: v.optional(v.string()),
      description: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),

    stackDrops: defineTable({
      stackId: v.id("stacks"),
      dropId: v.id("drops"),
      userId: v.id("users"),
    })
      .index("by_stack", ["stackId"])
      .index("by_drop", ["dropId"])
      .index("by_user", ["userId"]),

    // Lightweight activity history (saved, analyzed, starred, archived, …).
    activities: defineTable({
      userId: v.id("users"),
      dropId: v.optional(v.id("drops")),
      action: v.string(),
      detail: v.optional(v.string()),
      at: v.number(),
    })
      .index("by_user_at", ["userId", "at"])
      .index("by_drop", ["dropId"]),

    // Plan catalog — limits are configurable in the database (see seed.ts).
    plans: defineTable({
      planId: v.string(),
      name: v.string(),
      priceMonthly: v.number(),
      priceYearly: v.number(),
      currency: v.string(),
      dropLimit: v.optional(v.number()), // null = unlimited
      features: v.array(v.string()),
    }).index("by_planId", ["planId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
