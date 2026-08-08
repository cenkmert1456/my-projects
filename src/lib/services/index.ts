/**
 * DROP data services — the single data-access layer for the whole app.
 *
 * UI components import from here instead of calling Supabase directly, so
 * queries stay centralized, typed and testable.
 */

export { dropService } from "./drops";
export { collectionService } from "./collections";
export { stackService } from "./stacks";
export { reminderService } from "./reminders";
export { searchService } from "./search";
export { profileService } from "./profile";
export { storageService } from "./storage";
export { activityService, notificationService } from "./activities";
export { analyzeText } from "./analyze";
export { buildSearchText, rowToDrop, rowToDropList } from "./mappers";
export type { CreateDropInput, DropResult } from "./drops";
