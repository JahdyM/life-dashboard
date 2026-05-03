import { z } from "zod";
import { TASK_PRIORITIES } from "../constants";
import { DASHBOARD_MODULE_KEYS } from "../config/dashboard";
import {
  SPIRITUAL_GOAL_CATEGORY_KEYS,
  SPIRITUAL_STREAK_BOARD_KEYS,
} from "../config/spiritual";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const isoTimeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const boolishSchema = z.union([z.boolean(), z.number().int().min(0).max(1)]);
const nullableIsoDateSchema = z.union([z.string().regex(isoDateRegex), z.null()]);
const nullableIsoTimeSchema = z.union([z.string().regex(isoTimeRegex), z.null()]);
const nullableIsoDateTimeSchema = z.union([
  z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid ISO datetime",
  }),
  z.null(),
]);
const nullableBoundedInt = (min: number, max: number) =>
  z.union([z.number().int().min(min).max(max), z.null()]);
const nullableFocusOrder = z.union([z.number().int().min(1).max(1000), z.null()]);
const binaryDoneValueSchema = z
  .union([z.number().int().min(0).max(1), z.boolean()])
  .transform((value) => (typeof value === "boolean" ? (value ? 1 : 0) : value));

const hasInvalidHtmlTags = (value: string) => /<[^>]*>/g.test(value);

const optionalTrimmedText = (max: number) =>
  z.union([z.string().trim().max(max), z.null()]);

const intlAny = Intl as unknown as {
  supportedValuesOf?: (key: string) => string[];
};

const ianaZones =
  typeof intlAny.supportedValuesOf === "function"
    ? new Set(intlAny.supportedValuesOf("timeZone"))
    : null;

const validRange = (start: string, end: string) => start <= end;

export const taskIdSchema = z.string().trim().min(1).max(100);
export const subtaskIdSchema = z.string().trim().min(1).max(100);
export const isoDateSchema = z.string().regex(isoDateRegex, "Date must be YYYY-MM-DD");
export const monthKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM");

export const dateParamSchema = z.object({
  date: isoDateSchema,
});

export const rangeQuerySchema = z
  .object({
    start: isoDateSchema,
    end: isoDateSchema,
  })
  .refine((value) => validRange(value.start, value.end), {
    message: "start must be before or equal to end",
    path: ["end"],
  });

export const ministryMonthQuerySchema = z
  .object({
    month: monthKeySchema,
  })
  .strict();

export const spiritualStreakMonthQuerySchema = z
  .object({
    month: monthKeySchema,
  })
  .strict();

export const booksYearQuerySchema = z
  .object({
    year: z.coerce.number().int().min(2000).max(2100).optional(),
  })
  .strict();

export const coupleMoodboardQuerySchema = z.object({
  range: z.enum(["month", "year"]).default("month"),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM")
    .optional(),
});

export const estimationStatsQuerySchema = z
  .object({
    period: z.enum(["30d", "90d", "all"]).default("all"),
  })
  .strict();

export const statsPeriodQuerySchema = z
  .object({
    period: z.enum(["30d", "90d", "all"]).default("90d"),
  })
  .strict();

export const onboardingPreferencesSchema = z
  .object({
    completed: z.boolean().optional(),
    workspace_mode: z.enum(["solo", "shared"]).optional(),
    partner_email: z.union([z.string().trim().email().max(254), z.literal(""), z.null()]).optional(),
    modules: z
      .array(
        z
          .object({
            key: z.enum(DASHBOARD_MODULE_KEYS),
            label: z.string().trim().min(1).max(36),
            enabled: z.boolean(),
            nav_group: z.enum(["primary", "secondary"]),
            order: z.number().int().min(0).max(1000).optional(),
          })
          .strict()
      )
      .min(1)
      .max(DASHBOARD_MODULE_KEYS.length),
    shared_habits: z
      .array(
        z
          .object({
            key: z.string().trim().min(1).max(80),
            label: z.string().trim().min(1).max(36),
            enabled: z.boolean(),
          })
          .strict()
      )
      .max(24)
      .optional(),
    custom_habit_starters: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(120),
            name: z.string().trim().min(1).max(60),
            enabled: z.boolean(),
          })
          .strict()
      )
      .max(24)
      .optional(),
    spiritual_streaks: z
      .array(
        z
          .object({
            key: z.string().trim().min(1).max(80),
            label: z.string().trim().min(1).max(36),
            enabled: z.boolean(),
          })
          .strict()
      )
      .max(24)
      .optional(),
    moods: z
      .array(
        z
          .object({
            key: z.string().trim().min(1).max(80),
            label: z.string().trim().min(1).max(36),
            enabled: z.boolean(),
          })
          .strict()
      )
      .max(80)
      .optional(),
  })
  .strict();

export const anxietyTrendQuerySchema = z
  .object({
    days: z.enum(["30", "90"]).default("90"),
  })
  .strict();

export const weeklyReportQuerySchema = z
  .object({
    week: z
      .string()
      .regex(/^\d{4}-W\d{2}$/, "week must be YYYY-Wnn")
      .optional(),
  })
  .strict();

export const exportQuerySchema = z
  .object({
    format: z.enum(["csv", "json"]).default("csv"),
    start: isoDateSchema,
    end: isoDateSchema,
  })
  .refine((value) => validRange(value.start, value.end), {
    message: "start must be before or equal to end",
    path: ["end"],
  });

export const coupleAnalyticsQuerySchema = z
  .object({
    days: z.coerce.number().int().min(7).max(180).default(30),
  })
  .strict();

export const taskListQuerySchema = z
  .object({
    start: isoDateSchema,
    end: isoDateSchema,
    include_unscheduled: z.enum(["0", "1"]).optional(),
  })
  .refine((value) => validRange(value.start, value.end), {
    message: "start must be before or equal to end",
    path: ["end"],
  });

export const taskCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    source: z.string().trim().min(1).max(32).optional(),
    scheduled_date: nullableIsoDateSchema.optional(),
    scheduled_time: nullableIsoTimeSchema.optional(),
    planned_time: nullableIsoTimeSchema.optional(),
    start_time: nullableIsoTimeSchema.optional(),
    end_time: nullableIsoTimeSchema.optional(),
    notes: z.union([z.string().max(4000), z.null()]).optional(),
    priority_tag: z.enum(TASK_PRIORITIES).optional(),
    estimated_minutes: nullableBoundedInt(0, 480).optional(),
    actual_minutes: nullableBoundedInt(0, 1440).optional(),
    focus_order: nullableFocusOrder.optional(),
    is_done: boolishSchema.optional(),
    completed_at: nullableIsoDateTimeSchema.optional(),
    sync_google: z.boolean().optional(),
  })
  .strict();

export const taskPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    scheduled_date: nullableIsoDateSchema.optional(),
    scheduled_time: nullableIsoTimeSchema.optional(),
    planned_time: nullableIsoTimeSchema.optional(),
    start_time: nullableIsoTimeSchema.optional(),
    end_time: nullableIsoTimeSchema.optional(),
    notes: z.union([z.string().max(4000), z.null()]).optional(),
    priority_tag: z.enum(TASK_PRIORITIES).optional(),
    estimated_minutes: nullableBoundedInt(0, 480).optional(),
    actual_minutes: nullableBoundedInt(0, 1440).optional(),
    focus_order: nullableFocusOrder.optional(),
    is_done: boolishSchema.optional(),
    completed_at: nullableIsoDateTimeSchema.optional(),
    sync_google: z.boolean().optional(),
  })
  .strict();

export const dayPatchSchema = z
  .object({
    bible_reading: boolishSchema.optional(),
    bible_study: boolishSchema.optional(),
    dissertation_work: boolishSchema.optional(),
    workout: boolishSchema.optional(),
    general_reading: boolishSchema.optional(),
    shower: boolishSchema.optional(),
    daily_text: boolishSchema.optional(),
    meeting_attended: boolishSchema.optional(),
    prepare_meeting: boolishSchema.optional(),
    family_worship: boolishSchema.optional(),
    writing: boolishSchema.optional(),
    scientific_writing: boolishSchema.optional(),
    sleep_hours: z.number().min(0).max(24).optional(),
    anxiety_level: z.number().int().min(1).max(10).optional(),
    work_hours: z.number().min(0).max(24).optional(),
    boredom_minutes: z.number().int().min(0).max(1440).optional(),
    mood_category: z.union([z.string().trim().min(1).max(60), z.null()]).optional(),
    priority_label: z.union([z.string().trim().max(120), z.null()]).optional(),
    priority_done: boolishSchema.optional(),
    mood_note: z.union([z.string().trim().max(2000), z.null()]).optional(),
    mood_media_url: z
      .union([z.string().trim().url(), z.literal(""), z.null()])
      .optional(),
    mood_tags_json: z
      .union([
        z.string().trim().max(3000),
        z.array(z.string().trim().min(1).max(40)).max(30),
        z.null(),
      ])
      .optional(),
  })
  .strict();

export const meetingDaysSchema = z
  .object({
    days: z.array(z.number().int().min(0).max(6)).max(7),
  })
  .strict();

export const familyWorshipDaySchema = z
  .object({
    day: z.number().int().min(0).max(6),
  })
  .strict();

export const timezoneSchema = z
  .object({
    timezone: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine((value) => (ianaZones ? ianaZones.has(value) : true), {
        message: "Invalid IANA timezone",
      }),
  })
  .strict();

export const quickNoteTextSchema = z
  .object({
    text: z
      .string()
      .max(20000)
      .transform((value) => value.replace(/\r\n/g, "\n")),
  })
  .strict();

export const moodMomentCreateSchema = z
  .object({
    day_iso: isoDateSchema,
    logged_time: z.string().regex(isoTimeRegex, "Time must be HH:mm"),
    mood_category: z.string().trim().min(1).max(60),
    mood_note: z.union([z.string().trim().max(2000), z.null()]).optional(),
  })
  .strict();

const nullableBookCoverUrlSchema = z
  .union([z.string().trim().url(), z.literal(""), z.null()])
  .optional();

const nullableBookTextSchema = optionalTrimmedText(220).optional();

const nullableBookPagesSchema = z.union([z.number().int().min(1).max(20_000), z.null()]);

export const booksGoalUpdateSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    yearly_goal: z.number().int().min(0).max(500),
  })
  .strict();

export const bookCreateSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    title: z.string().trim().min(1).max(220),
    author: nullableBookTextSchema,
    cover_url: nullableBookCoverUrlSchema,
    total_pages: nullableBookPagesSchema.optional(),
    pages_read: z.number().int().min(0).max(20_000).optional(),
    status: z.enum(["reading", "finished", "planned"]).optional(),
    rating: z.union([z.number().int().min(1).max(5), z.null()]).optional(),
  })
  .strict();

export const readingPatchSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("import_despertai"),
      raw: z.string().min(1).max(500_000),
    })
    .strict(),
  z
    .object({
      type: z.literal("toggle_despertai_topic"),
      issue_id: taskIdSchema,
      topic_id: taskIdSchema,
      read: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("toggle_despertai_issue"),
      issue_id: taskIdSchema,
      read: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("set_despertai_read_count"),
      issue_id: taskIdSchema,
      read_count: z.number().int().min(0).max(500),
    })
    .strict(),
  z
    .object({
      type: z.literal("toggle_reading_video"),
      video_id: taskIdSchema,
      read: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("toggle_broadcasting_video"),
      video_id: taskIdSchema,
      read: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("toggle_article_series"),
      video_id: taskIdSchema,
      read: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("toggle_bible_chapter"),
      book_key: z.string().trim().min(1).max(80),
      chapter: z.number().int().min(1).max(200),
      read: z.boolean(),
    })
    .strict(),
]);

export const bookPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(220).optional(),
    author: nullableBookTextSchema,
    cover_url: nullableBookCoverUrlSchema,
    total_pages: nullableBookPagesSchema.optional(),
    pages_read: z.number().int().min(0).max(20_000).optional(),
    status: z.enum(["reading", "finished", "planned"]).optional(),
    rating: z.union([z.number().int().min(1).max(5), z.null()]).optional(),
    year: z.number().int().min(2000).max(2100).optional(),
  })
  .strict();

export const ministryMonthlyGoalSchema = z
  .object({
    month: monthKeySchema,
    target_minutes: z.union([z.number().int().min(0).max(60_000), z.null()]),
  })
  .strict();

export const ministryDayEntrySchema = z
  .object({
    goal_minutes: z.union([z.number().int().min(0).max(1440), z.null()]),
    actual_minutes: z.union([z.number().int().min(0).max(1440), z.null()]),
    notes: z.union([z.string().trim().max(4000), z.null()]),
  })
  .strict();

const spiritualGoalCategories = SPIRITUAL_GOAL_CATEGORY_KEYS;

export const spiritualGoalCategorySchema = z.enum(spiritualGoalCategories);

export const spiritualGoalTaskSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(100),
    completed: z.boolean(),
    created_at: nullableIsoDateTimeSchema.optional(),
    updated_at: nullableIsoDateTimeSchema.optional(),
  })
  .strict();

export const spiritualGoalStepSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    title: z.string().trim().min(1).max(60),
    description: optionalTrimmedText(1600),
    notes: optionalTrimmedText(2500),
    completed_at: nullableIsoDateTimeSchema.optional(),
    tasks: z.array(spiritualGoalTaskSchema).max(24),
  })
  .strict();

export const spiritualGoalStaircaseSchema = z
  .object({
    category: spiritualGoalCategorySchema,
    title: z.string().trim().min(1).max(80),
    ultimate_goal: z.string().trim().min(1).max(220),
    subtitle: optionalTrimmedText(220),
    theme_color: z
      .union([z.string().trim().regex(/^#([0-9a-fA-F]{6})$/, "Use a hex color"), z.null()])
      .optional(),
    avatar_style: z.enum(["sprout", "spark", "compass", "bookmark"]).nullable().optional(),
    general_notes: optionalTrimmedText(4000),
    steps: z.array(spiritualGoalStepSchema).max(12),
  })
  .strict();

const spiritualStreakBoardKeys = SPIRITUAL_STREAK_BOARD_KEYS;

export const spiritualStreakBoardKeySchema = z.enum(spiritualStreakBoardKeys);

export const spiritualStreakEntrySchema = z
  .object({
    date: isoDateSchema,
    success: z.boolean(),
    note: optionalTrimmedText(1200).optional(),
    created_at: nullableIsoDateTimeSchema.optional(),
    updated_at: nullableIsoDateTimeSchema.optional(),
  })
  .strict();

export const spiritualStreakBoardStateSchema = z
  .object({
    entries: z.array(spiritualStreakEntrySchema).max(5000).default([]),
  })
  .strict();

export const spiritualStreakUpdateSchema = z
  .object({
    month: monthKeySchema,
    date: isoDateSchema,
    success: z.union([z.boolean(), z.null()]),
    note: optionalTrimmedText(1200).optional(),
    use_grace: z.boolean().optional(),
  })
  .strict();

export const spiritualGoalActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("complete_current") }).strict(),
  z
    .object({
      type: z.literal("move_to_step"),
      step_id: z.string().trim().min(1).max(120),
      confirmed: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal("move_back") }).strict(),
  z
    .object({
      type: z.literal("toggle_task"),
      step_id: z.string().trim().min(1).max(120),
      task_id: z.string().trim().min(1).max(120),
      completed: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("add_task"),
      step_id: z.string().trim().min(1).max(120),
      title: z.string().trim().min(1).max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal("update_task"),
      step_id: z.string().trim().min(1).max(120),
      task_id: z.string().trim().min(1).max(120),
      title: z.string().trim().min(1).max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal("remove_task"),
      step_id: z.string().trim().min(1).max(120),
      task_id: z.string().trim().min(1).max(120),
    })
    .strict(),
  z
    .object({
      type: z.literal("save_step_notes"),
      step_id: z.string().trim().min(1).max(120),
      notes: optionalTrimmedText(2500),
    })
    .strict(),
  z
    .object({
      type: z.literal("save_general_notes"),
      notes: optionalTrimmedText(4000),
    })
    .strict(),
]);

export const customHabitSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .max(60)
      .refine((value) => !hasInvalidHtmlTags(value), {
        message: "Habit name must not contain HTML",
      }),
  })
  .strict();

export const customHabitDoneSchema = z
  .object({
    done: z.record(
      z.string().trim().min(1).max(120),
      binaryDoneValueSchema
    ),
  })
  .strict();

export const taskShareCreateSchema = z
  .object({
    task_id: taskIdSchema,
    to_email: z.string().trim().email().optional(),
  })
  .strict();

export const subtaskCreateSchema = z
  .object({
    task_id: taskIdSchema,
    title: z.string().trim().min(1).max(200),
    order: z.coerce.number().int().min(1).max(9999).optional(),
  })
  .strict();

export const subtaskPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    order: z.coerce.number().int().min(1).max(9999).optional(),
    priority_tag: z.enum(TASK_PRIORITIES).optional(),
    estimated_minutes: nullableBoundedInt(0, 480).optional(),
    actual_minutes: nullableBoundedInt(0, 1440).optional(),
    is_done: boolishSchema.optional(),
    completed_at: nullableIsoDateTimeSchema.optional(),
  })
  .strict();
