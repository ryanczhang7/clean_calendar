import { describe, expect, test, vi } from "vitest";
import {
  type ClientsLike,
  type NotificationTarget,
  openReminder,
  parseReminderPayload,
  pushData,
  type ReminderPayload,
  reminderBody,
  reminderUrl,
  showReminder,
  type WindowClientLike,
} from "./pushHandlers";

// CAL-028 Contract Block 5 (AC-6): the worker's push handlers as plain
// functions. Settled values worked by hand in the Contract and re-measured with
// Node's Intl (2026-11-03): 2026-11-03T05:30:00Z is 05:30 on 2026-11-03 in
// Europe/London and 23:30 on 2026-11-02 in America/Chicago (UTC-6 on that
// date). The Chicago case is the day-boundary control: a reminderUrl that took
// the date from the UTC fields would answer 2026-11-03 there.

const LONDON = "Europe/London";
const CHICAGO = "America/Chicago";
const DOT = "·";

const PAYLOAD: ReminderPayload = {
  eventId: "evt-1",
  title: "Dentist",
  startsAt: "2026-11-03T05:30:00Z",
  allDay: false,
  location: "12 High Street",
};

describe("pushData reads the push event's JSON", () => {
  test("absent data is null", () => {
    expect(pushData(null)).toBeNull();
    expect(pushData(undefined)).toBeNull();
  });

  test("data whose json() answers is that value", () => {
    expect(pushData({ json: () => ({ eventId: "evt-1" }) })).toEqual({
      eventId: "evt-1",
    });
  });

  test("data whose json() throws (a non-JSON push) is null, not a throw", () => {
    expect(
      pushData({
        json: () => {
          throw new SyntaxError("Unexpected token");
        },
      }),
    ).toBeNull();
  });
});

describe("parseReminderPayload accepts exactly the five-field payload", () => {
  test("a full payload is returned with its five fields", () => {
    expect(parseReminderPayload({ ...PAYLOAD })).toEqual(PAYLOAD);
  });

  test("a null location is kept as null", () => {
    expect(parseReminderPayload({ ...PAYLOAD, location: null })).toEqual({
      ...PAYLOAD,
      location: null,
    });
  });

  test("an absent location counts as null", () => {
    const { location: _omit, ...rest } = PAYLOAD;
    expect(parseReminderPayload(rest)).toEqual({ ...PAYLOAD, location: null });
  });

  test("an all-day payload is accepted", () => {
    expect(parseReminderPayload({ ...PAYLOAD, allDay: true })?.allDay).toBe(
      true,
    );
  });

  test.each<[string, unknown]>([
    ["null", null],
    ["undefined", undefined],
    ["a string", JSON.stringify(PAYLOAD)],
    ["a number", 5],
    ["an array", [PAYLOAD]],
    ["no eventId", { ...PAYLOAD, eventId: undefined }],
    ["an empty eventId", { ...PAYLOAD, eventId: "" }],
    ["a numeric eventId", { ...PAYLOAD, eventId: 7 }],
    ["no title", { ...PAYLOAD, title: undefined }],
    ["an empty title", { ...PAYLOAD, title: "" }],
    ["a numeric title", { ...PAYLOAD, title: 1 }],
    ["no startsAt", { ...PAYLOAD, startsAt: undefined }],
    ["an unparseable startsAt", { ...PAYLOAD, startsAt: "tomorrow-ish" }],
    ["a numeric startsAt", { ...PAYLOAD, startsAt: 1_793_000_000_000 }],
    ["no allDay", { ...PAYLOAD, allDay: undefined }],
    ["a string allDay", { ...PAYLOAD, allDay: "false" }],
    ["a numeric location", { ...PAYLOAD, location: 12 }],
    ["an object location", { ...PAYLOAD, location: { street: "High" } }],
  ])("%s is rejected (null)", (_label, data) => {
    expect(parseReminderPayload(data)).toBeNull();
  });
});

describe("reminderBody is the start time in the device's zone, then the location", () => {
  test(`in ${LONDON}: "05:30 ${DOT} 12 High Street"`, () => {
    expect(reminderBody(PAYLOAD, LONDON)).toBe("05:30 · 12 High Street");
  });

  test(`in ${CHICAGO}: "23:30 ${DOT} 12 High Street" (the previous evening)`, () => {
    expect(reminderBody(PAYLOAD, CHICAGO)).toBe("23:30 · 12 High Street");
  });

  test("the separator is a middle dot U+00B7 with a space either side", () => {
    const body = reminderBody(PAYLOAD, LONDON);
    expect(body.slice(5, 8)).toBe(" · ");
    expect(body.codePointAt(6)).toBe(0x00b7);
  });

  test("no location is the time alone", () => {
    expect(reminderBody({ ...PAYLOAD, location: null }, LONDON)).toBe("05:30");
  });

  test("an empty location is the time alone, with no dangling separator", () => {
    expect(reminderBody({ ...PAYLOAD, location: "" }, LONDON)).toBe("05:30");
  });

  test("the hour is 24-hour and zero-padded: a minute past midnight is 00:05, not 24:05 or 12:05 am", () => {
    const p = { ...PAYLOAD, startsAt: "2026-11-03T00:05:00Z", location: null };
    expect(reminderBody(p, LONDON)).toBe("00:05");
  });

  test('an all-day reminder is "All day", without the location', () => {
    expect(reminderBody({ ...PAYLOAD, allDay: true }, LONDON)).toBe("All day");
    expect(reminderBody({ ...PAYLOAD, allDay: true }, CHICAGO)).toBe("All day");
  });

  test("without a zone it formats in the device's own zone", () => {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(reminderBody(PAYLOAD)).toBe(reminderBody(PAYLOAD, local));
  });
});

describe("reminderUrl opens the event's day in the device's zone", () => {
  test(`in ${LONDON}: /day/2026-11-03?event=evt-1`, () => {
    expect(reminderUrl(PAYLOAD, LONDON)).toBe("/day/2026-11-03?event=evt-1");
  });

  test(`in ${CHICAGO}: /day/2026-11-02?event=evt-1 (the UTC date would be wrong)`, () => {
    expect(reminderUrl(PAYLOAD, CHICAGO)).toBe("/day/2026-11-02?event=evt-1");
  });

  test("the eventId is URL-encoded", () => {
    expect(reminderUrl({ ...PAYLOAD, eventId: "a b&c/d?e" }, LONDON)).toBe(
      `/day/2026-11-03?event=${encodeURIComponent("a b&c/d?e")}`,
    );
    expect(reminderUrl({ ...PAYLOAD, eventId: "a b&c/d?e" }, LONDON)).toBe(
      "/day/2026-11-03?event=a%20b%26c%2Fd%3Fe",
    );
  });

  test("without a zone it uses the device's own zone", () => {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(reminderUrl(PAYLOAD)).toBe(reminderUrl(PAYLOAD, local));
  });
});

function fakeTarget() {
  const showNotification = vi.fn<NotificationTarget["showNotification"]>(
    async () => {},
  );
  const target: NotificationTarget = { showNotification };
  return { target, showNotification };
}

describe("showReminder shows one notification per valid payload", () => {
  test("calls showNotification(title, {body, data: {url}, tag: eventId}) exactly once", async () => {
    const { target, showNotification } = fakeTarget();
    await showReminder(target, { ...PAYLOAD });
    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith("Dentist", {
      body: reminderBody(PAYLOAD),
      data: { url: reminderUrl(PAYLOAD) },
      tag: "evt-1",
    });
  });

  test("waits for showNotification to settle before resolving", async () => {
    let settled = false;
    const target: NotificationTarget = {
      showNotification: () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            settled = true;
            resolve();
          }, 0),
        ),
    };
    await showReminder(target, { ...PAYLOAD });
    expect(settled).toBe(true);
  });

  test.each<[string, unknown]>([
    ["null data", null],
    ["a payload with no title", { ...PAYLOAD, title: "" }],
    ["a bare string", "Dentist at 05:30"],
  ])("%s shows nothing and resolves", async (_label, data) => {
    const { target, showNotification } = fakeTarget();
    await expect(showReminder(target, data)).resolves.toBeUndefined();
    expect(showNotification).not.toHaveBeenCalled();
  });
});

const URL_ = "/day/2026-11-03?event=evt-1";

function fakeClients(windowCount: number) {
  const timeline: string[] = [];
  const later = (label: string) =>
    new Promise<unknown>((resolve) =>
      setTimeout(() => {
        timeline.push(`${label} settled`);
        resolve(undefined);
      }, 0),
    );
  const windows = Array.from({ length: windowCount }, (_, i) => {
    const focus = vi.fn<WindowClientLike["focus"]>(() => {
      timeline.push(`focus ${i}`);
      return later(`focus ${i}`);
    });
    const navigate = vi.fn<WindowClientLike["navigate"]>((url: string) => {
      timeline.push(`navigate ${i} ${url}`);
      return later(`navigate ${i}`);
    });
    return { focus, navigate };
  });
  const matchAll = vi.fn<ClientsLike["matchAll"]>(async () => windows);
  const openWindow = vi.fn<ClientsLike["openWindow"]>((url: string) => {
    timeline.push(`openWindow ${url}`);
    return later("openWindow");
  });
  const clients: ClientsLike = { matchAll, openWindow };
  return { clients, windows, matchAll, openWindow, timeline };
}

describe("openReminder focuses an open window or opens a new one", () => {
  test("asks for every window client, controlled or not", async () => {
    const fake = fakeClients(1);
    await openReminder(fake.clients, URL_);
    expect(fake.matchAll).toHaveBeenCalledTimes(1);
    expect(fake.matchAll).toHaveBeenCalledWith({
      type: "window",
      includeUncontrolled: true,
    });
  });

  test("with open windows: the FIRST is focused, then navigated to the url, and no window is opened", async () => {
    const fake = fakeClients(2);
    await openReminder(fake.clients, URL_);
    expect(fake.timeline).toEqual([
      "focus 0",
      "focus 0 settled",
      `navigate 0 ${URL_}`,
      "navigate 0 settled",
    ]);
    expect(fake.windows[1]?.focus).not.toHaveBeenCalled();
    expect(fake.windows[1]?.navigate).not.toHaveBeenCalled();
    expect(fake.openWindow).not.toHaveBeenCalled();
  });

  test("with no open window: a new window is opened at the url", async () => {
    const fake = fakeClients(0);
    await openReminder(fake.clients, URL_);
    expect(fake.openWindow).toHaveBeenCalledTimes(1);
    expect(fake.openWindow).toHaveBeenCalledWith(URL_);
    expect(fake.timeline).toEqual([`openWindow ${URL_}`, "openWindow settled"]);
  });
});
