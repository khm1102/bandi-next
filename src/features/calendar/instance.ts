import "server-only";
import { db } from "@/lib/db";
import { createCalendarService } from "./service";

export function calendarService() {
  return createCalendarService({ db });
}
