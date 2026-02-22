import { z } from "zod";
import { TASK_PRIORITIES } from "../constants";

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
const isoTimeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

const boolishSchema = z.union([z.boolean(), z.number().int().min(0).max(1)]);
const nullableIsoDateSchema = z.union([z.string().regex(isoDateRegex), z.null()]);
const nullableIsoTimeSchema = z.union([z.string().regex(isoTimeRegex), z.null()]);
const nullableBoundedInt = (min: number, max: number) =>
  z.union([z.number().int().min(min).max(max), z.null()]);

const hasInvalidHtmlTags = (value: string) => /<[^>]*>/g.test(value);

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

export const coupleMoodboardQuerySchema = z.object({
  range: z.enum(["month", "year"]).default("month"),
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM")
    .optional(),
});

export const taskListQuerySchema = z
  .object({
    start: isoDateSchema,
    end: isoDateSchema,
    sync: z.enum(["0", "1"]).optional(),
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
    priority_tag: z.enum(TASK_PRIORITIES).optional(),
    estimated_minutes: nullableBoundedInt(0, 480).optional(),
    actual_minutes: nullableBoundedInt(0, 1440).optional(),
    is_done: boolishSchema.optional(),
    sync_google: z.boolean().optional(),
  })
  .strict();

export const taskPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    scheduled_date: nullableIsoDateSchema.optional(),
    scheduled_time: nullableIsoTimeSchema.optional(),
    priority_tag: z.enum(TASK_PRIORITIES).optional(),
    estimated_minutes: nullableBoundedInt(0, 480).optional(),
    actual_minutes: nullableBoundedInt(0, 1440).optional(),
    is_done: boolishSchema.optional(),
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
      z.union([z.number().int().min(0).max(1), z.boolean()])
    ),
  })
  .strict();

export const subtaskCreateSchema = z
  .object({
    task_id: taskIdSchema,
    title: z.string().trim().min(1).max(200),
  })
  .strict();

export const subtaskPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    priority_tag: z.enum(TASK_PRIORITIES).optional(),
    estimated_minutes: nullableBoundedInt(0, 480).optional(),
    actual_minutes: nullableBoundedInt(0, 1440).optional(),
    is_done: boolishSchema.optional(),
  })
  .strict();
