import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { JSX } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
import type { CaptureResponse } from "../../shared/captureSchema";
import type { ShareEntry } from "../pwa/inbox";
import type { CaptureOutcome, proposeEvent } from "./captureClient";
import { CapturePage } from "./CapturePage";
import type { downscaleImage } from "./downscale";

vi.mock(
  "../lib/supabase",
  async () => (await import("../test/supabase-mock")).supabaseModule,
);

// CAL-020 Contract, Block 3 (AC-1 to AC-4). The page in a memory router with
// a stand-in /capture/confirm route, so the navigation and its router state
// (the CaptureHandoff, Block 1) are read straight off `router.state`. The
// function call and the downscaler are the page's `propose` and `downscale`
// props, both vi.fn stubs - so no request leaves the page and no canvas is
// needed (Block 9). SETTLED: every string is voice.md's, read out.
// MECHANICAL: the working state, the request bodies, image-wins, Cancel,
// Retry, the offline gating.
//
// navigator.onLine is spied (as SignInPage.test.tsx does) and the
// online/offline window events are dispatched by hand. userEvent.setup()
// installs its own navigator.clipboard, so the Paste tests replace it AFTER
// setup and put the original descriptor back afterwards.

const JOB_ID = "0b6c2a7e-3f4d-4c1a-9e2b-7d8f9a0b1c2d";

const RESPONSE: CaptureResponse = {
  proposal: {
    title: "Dinner at Lupa",
    startsAt: "2026-11-03T19:30:00+01:00",
    endsAt: null,
    allDay: false,
    location: "Lupa",
    kindName: "Dining",
  },
  confidence: {},
  missing: [],
  jobId: JOB_ID,
};

const OK: CaptureOutcome = { status: "ok", response: RESPONSE };

const DOWNSCALED = {
  mime: "image/jpeg" as const,
  base64: "/9j/4AAQ",
  bytes: 6,
  width: 2048,
  height: 1536,
  dataUrl: "data:image/jpeg;base64,/9j/4AAQ",
};

const PLACEHOLDER =
  "Paste the confirmation email, or any text with a date in it.";
const WORKING = "Asking the assistant… usually takes a few seconds.";
const OFFLINE =
  "Capture needs a connection. Your other changes are saved and will sync.";
const COULDNT_READ = "Couldn't read that. Try pasting the text instead.";
const TOO_LARGE =
  "That screenshot is too large, even after shrinking it. Try cropping it.";
const ONLY_IMAGE = "Only the screenshot will be sent.";

type Propose = Mock<typeof proposeEvent>;
type Downscale = Mock<typeof downscaleImage>;
type Take = Mock<() => Promise<ShareEntry | null>>;

function Confirmed(): JSX.Element {
  return <h1>Confirm stand-in</h1>;
}

function renderCapture(
  opts: {
    propose?: Propose;
    downscale?: Downscale;
    // CAL-022: the share inbox, and the URL the page is opened at.
    inbox?: { take: Take };
    at?: string;
  } = {},
) {
  const user = userEvent.setup();
  const propose = opts.propose ?? vi.fn<typeof proposeEvent>(async () => OK);
  const downscale =
    opts.downscale ??
    vi.fn<typeof downscaleImage>(async () => ({
      status: "ok",
      image: DOWNSCALED,
    }));
  const router = createMemoryRouter(
    [
      {
        path: "/capture",
        element: (
          <CapturePage
            propose={propose}
            downscale={downscale}
            inbox={opts.inbox}
          />
        ),
      },
      { path: "/capture/confirm", element: <Confirmed /> },
    ],
    { initialEntries: [opts.at ?? "/capture"] },
  );
  render(<RouterProvider router={router} />);
  return { user, propose, downscale, router };
}

/** A promise the test settles by hand. */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve: (v: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Let pending promise callbacks and the renders they cause run. */
async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

const textBox = () =>
  screen.getByRole("textbox", { name: "Booking email or text" });
const fileInput = () =>
  screen.getByLabelText("Choose a screenshot") as HTMLInputElement;
const proposeButton = () =>
  screen.getByRole("button", { name: "Propose event" });
const png = (content = "png-bytes") =>
  new File([content], "booking.png", { type: "image/png" });

const expectEnabled = (button: HTMLElement) =>
  expect(button).not.toHaveAttribute("aria-disabled", "true");

let clipboard: PropertyDescriptor | undefined;

beforeEach(() => {
  clipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
});

afterEach(() => {
  if (clipboard === undefined) {
    Reflect.deleteProperty(navigator, "clipboard");
  } else {
    Object.defineProperty(navigator, "clipboard", clipboard);
  }
  vi.restoreAllMocks();
});

describe("the empty capture screen (AC-1, Block 3)", () => {
  it('shows the heading "Capture" as the one <h1>, focusable by script', () => {
    renderCapture();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent(/^Capture$/);
    expect(h1).toHaveAttribute("tabindex", "-1");
  });

  it('has a <textarea> labelled "Booking email or text" with the voice.md placeholder and 8 rows', () => {
    renderCapture();
    const box = textBox();
    expect(box.tagName).toBe("TEXTAREA");
    expect(box).toHaveAttribute("placeholder", PLACEHOLDER);
    expect(box).toHaveAttribute("rows", "8");
    expect(box).toHaveValue("");
  });

  it('has a "Choose a screenshot" control that is <input type="file" accept="image/*">', () => {
    renderCapture();
    const input = fileInput();
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveAttribute("type", "file");
    expect(input).toHaveAttribute("accept", "image/*");
  });

  it('"Propose event" is a button with aria-disabled="true" - not the disabled attribute - while both inputs are empty', () => {
    renderCapture();
    const button = proposeButton();
    expect(button).toHaveAttribute("type", "button");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toHaveAttribute("disabled");
  });

  it("the controls come in the Contract's DOM order: heading, paste box, screenshot, Propose", () => {
    renderCapture();
    const order = [
      screen.getByRole("heading", { level: 1 }),
      textBox(),
      fileInput(),
      proposeButton(),
    ];
    for (let i = 1; i < order.length; i += 1) {
      const before = order[i - 1] as HTMLElement;
      const after = order[i] as HTMLElement;
      expect(
        before.compareDocumentPosition(after) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("shows no status line, no alert, no thumbnail and no note before anything happens", () => {
    renderCapture();
    expect(proposeButton()).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByText(ONLY_IMAGE)).toBeNull();
    expect(screen.queryByText(OFFLINE)).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});

describe('"Propose event" is enabled only with content (AC-1)', () => {
  it("typing text enables it", async () => {
    const { user } = renderCapture();
    await user.type(textBox(), "Dinner 3 Nov");
    expectEnabled(proposeButton());
  });

  it("whitespace alone does not count as content", async () => {
    const { user } = renderCapture();
    await user.type(textBox(), "   ");
    expect(proposeButton()).toHaveAttribute("aria-disabled", "true");
  });

  it("clearing the text disables it again", async () => {
    const { user } = renderCapture();
    await user.type(textBox(), "x");
    await user.clear(textBox());
    expect(proposeButton()).toHaveAttribute("aria-disabled", "true");
  });

  it("picking an image, with no text, enables it", async () => {
    const { user } = renderCapture();
    await user.upload(fileInput(), png());
    expectEnabled(proposeButton());
  });

  it("a click while aria-disabled does nothing: nothing is proposed", async () => {
    const { user, propose } = renderCapture();
    await user.click(proposeButton());
    await settle();
    expect(propose).not.toHaveBeenCalled();
    expect(screen.queryByText(WORKING)).toBeNull();
  });
});

describe("proposing text (AC-2, Block 3)", () => {
  it("calls propose once with {text}, exactly, the text as typed (not trimmed)", async () => {
    const { user, propose, downscale } = renderCapture();
    await user.type(textBox(), "  Table for two, 3 Nov 19:30  ");
    await user.click(proposeButton());
    await waitFor(() => expect(propose).toHaveBeenCalledTimes(1));
    expect(propose.mock.calls[0]?.[0]).toStrictEqual({
      text: "  Table for two, 3 Nov 19:30  ",
    });
    expect(downscale).not.toHaveBeenCalled();
  });

  it('while it runs: the paste box is read-only, the button aria-busy and aria-disabled, and the status line reads "Asking the assistant… usually takes a few seconds."', async () => {
    const pending = deferred<CaptureOutcome>();
    const { user } = renderCapture({
      propose: vi.fn<typeof proposeEvent>(() => pending.promise),
    });
    await user.type(textBox(), "Dinner 3 Nov");
    await user.click(proposeButton());

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent(WORKING);
    expect(textBox()).toHaveAttribute("readonly");
    expect(fileInput()).toBeDisabled();
    expect(proposeButton()).toHaveAttribute("aria-busy", "true");
    expect(proposeButton()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("a second click while it runs proposes nothing more", async () => {
    const pending = deferred<CaptureOutcome>();
    const { user, propose } = renderCapture({
      propose: vi.fn<typeof proposeEvent>(() => pending.promise),
    });
    await user.type(textBox(), "Dinner 3 Nov");
    await user.click(proposeButton());
    await screen.findByText(WORKING);
    await user.click(proposeButton());
    await settle();
    expect(propose).toHaveBeenCalledTimes(1);
  });

  it("on ok, navigates to /capture/confirm with the handoff {response, source: {kind: text, text}} in router state", async () => {
    const { user, router } = renderCapture();
    await user.type(textBox(), "Dinner 3 Nov");
    await user.click(proposeButton());
    expect(
      await screen.findByRole("heading", { name: "Confirm stand-in" }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/capture/confirm");
    expect(router.state.location.state).toStrictEqual({
      response: RESPONSE,
      source: { kind: "text", text: "Dinner 3 Nov" },
    });
  });
});

describe("Cancel abandons the request (Block 3, mechanical)", () => {
  it("restores the inputs, keeps the text, and removes the status line", async () => {
    const pending = deferred<CaptureOutcome>();
    const { user } = renderCapture({
      propose: vi.fn<typeof proposeEvent>(() => pending.promise),
    });
    await user.type(textBox(), "Dinner 3 Nov");
    await user.click(proposeButton());
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(textBox()).not.toHaveAttribute("readonly");
    expect(textBox()).toHaveValue("Dinner 3 Nov");
    expect(fileInput()).not.toBeDisabled();
    expect(proposeButton()).not.toHaveAttribute("aria-busy", "true");
    expectEnabled(proposeButton());
    expect(screen.queryByText(WORKING)).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });

  it("a result arriving after Cancel is ignored: no navigation", async () => {
    const pending = deferred<CaptureOutcome>();
    const { user, router } = renderCapture({
      propose: vi.fn<typeof proposeEvent>(() => pending.promise),
    });
    await user.type(textBox(), "Dinner 3 Nov");
    await user.click(proposeButton());
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await act(async () => pending.resolve(OK));
    await settle();
    expect(router.state.location.pathname).toBe("/capture");
    expect(
      screen.queryByRole("heading", { name: "Confirm stand-in" }),
    ).toBeNull();
  });

  it("an error arriving after Cancel is ignored: no alert", async () => {
    const pending = deferred<CaptureOutcome>();
    const { user } = renderCapture({
      propose: vi.fn<typeof proposeEvent>(() => pending.promise),
    });
    await user.type(textBox(), "Dinner 3 Nov");
    await user.click(proposeButton());
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await act(async () =>
      pending.resolve({ status: "error", code: "upstream", http: 502 }),
    );
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("a picked screenshot (AC-3, Block 3)", () => {
  it('shows a 96 px tall <img alt="Screenshot preview"> from a data URL, and a "Remove screenshot" button', async () => {
    const { user } = renderCapture();
    await user.upload(fileInput(), png());
    const thumb = await screen.findByRole("img", {
      name: "Screenshot preview",
    });
    expect(thumb.getAttribute("src")).toMatch(/^data:image\/[a-z]+;base64,/);
    expect(thumb).toHaveAttribute("height", "96");
    expect(
      screen.getByRole("button", { name: "Remove screenshot" }),
    ).toHaveAttribute("type", "button");
  });

  it('"Remove screenshot" clears it: no thumbnail, and with no text Propose is disabled again', async () => {
    const { user } = renderCapture();
    await user.upload(fileInput(), png());
    await user.click(
      await screen.findByRole("button", { name: "Remove screenshot" }),
    );
    expect(
      screen.queryByRole("img", { name: "Screenshot preview" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Remove screenshot" }),
    ).toBeNull();
    expect(proposeButton()).toHaveAttribute("aria-disabled", "true");
  });

  it("proposing downscales the picked file, then sends {image, mime} from the downscaled result, exactly", async () => {
    const { user, propose, downscale } = renderCapture();
    const shot = png();
    await user.upload(fileInput(), shot);
    await user.click(proposeButton());
    await waitFor(() => expect(propose).toHaveBeenCalledTimes(1));
    expect(downscale).toHaveBeenCalledTimes(1);
    expect(downscale.mock.calls[0]?.[0]).toBe(shot);
    // The downscaler turned the PNG into a JPEG: its mime is what is sent.
    expect(propose.mock.calls[0]?.[0]).toStrictEqual({
      image: DOWNSCALED.base64,
      mime: "image/jpeg",
    });
  });

  it("on ok, the handoff's source is {kind: image, dataUrl, mime} of the downscaled image", async () => {
    const { user, router } = renderCapture();
    await user.upload(fileInput(), png());
    await user.click(proposeButton());
    await screen.findByRole("heading", { name: "Confirm stand-in" });
    expect(router.state.location.state).toStrictEqual({
      response: RESPONSE,
      source: {
        kind: "image",
        dataUrl: DOWNSCALED.dataUrl,
        mime: "image/jpeg",
      },
    });
  });

  it("while it runs, the file input and Remove screenshot are disabled", async () => {
    const pending = deferred<CaptureOutcome>();
    const { user } = renderCapture({
      propose: vi.fn<typeof proposeEvent>(() => pending.promise),
    });
    await user.upload(fileInput(), png());
    await user.click(proposeButton());
    await screen.findByText(WORKING);
    expect(fileInput()).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remove screenshot" }),
    ).toBeDisabled();
  });
});

describe("text and a screenshot together: the image wins (AC-3)", () => {
  it('says "Only the screenshot will be sent." and sends only {image, mime}', async () => {
    const { user, propose } = renderCapture();
    await user.type(textBox(), "Dinner 3 Nov");
    await user.upload(fileInput(), png());
    expect(await screen.findByText(ONLY_IMAGE)).toBeInTheDocument();
    await user.click(proposeButton());
    await waitFor(() => expect(propose).toHaveBeenCalledTimes(1));
    expect(propose.mock.calls[0]?.[0]).toStrictEqual({
      image: DOWNSCALED.base64,
      mime: "image/jpeg",
    });
  });

  it("no note with an image and only whitespace in the paste box", async () => {
    const { user } = renderCapture();
    await user.type(textBox(), "   ");
    await user.upload(fileInput(), png());
    await screen.findByRole("img", { name: "Screenshot preview" });
    expect(screen.queryByText(ONLY_IMAGE)).toBeNull();
  });

  it("no note with text alone", async () => {
    const { user } = renderCapture();
    await user.type(textBox(), "Dinner 3 Nov");
    expect(screen.queryByText(ONLY_IMAGE)).toBeNull();
  });

  it("removing the screenshot removes the note, and the text is what is sent", async () => {
    const { user, propose } = renderCapture();
    await user.type(textBox(), "Dinner 3 Nov");
    await user.upload(fileInput(), png());
    await user.click(
      await screen.findByRole("button", { name: "Remove screenshot" }),
    );
    expect(screen.queryByText(ONLY_IMAGE)).toBeNull();
    await user.click(proposeButton());
    await waitFor(() => expect(propose).toHaveBeenCalledTimes(1));
    expect(propose.mock.calls[0]?.[0]).toStrictEqual({ text: "Dinner 3 Nov" });
  });
});

describe("offline (AC-4, Block 3)", () => {
  it("navigator.onLine false at render: the notice shows and Propose stays disabled even with text", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const { user, propose } = renderCapture();
    expect(screen.getByText(OFFLINE)).toBeInTheDocument();
    await user.type(textBox(), "Dinner 3 Nov");
    expect(proposeButton()).toHaveAttribute("aria-disabled", "true");
    await user.click(proposeButton());
    await settle();
    expect(propose).not.toHaveBeenCalled();
  });

  it("follows the window's offline and online events", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const { user } = renderCapture();
    await user.type(textBox(), "Dinner 3 Nov");
    expectEnabled(proposeButton());

    onLine.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(screen.getByText(OFFLINE)).toBeInTheDocument();
    expect(proposeButton()).toHaveAttribute("aria-disabled", "true");

    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByText(OFFLINE)).toBeNull();
    expectEnabled(proposeButton());
  });

  it("an offline outcome shows the offline notice and no alert; the online event re-enables Propose", async () => {
    const { user, propose } = renderCapture({
      propose: vi.fn<typeof proposeEvent>(async () => ({ status: "offline" })),
    });
    await user.type(textBox(), "Dinner 3 Nov");
    await user.click(proposeButton());
    expect(await screen.findByText(OFFLINE)).toBeInTheDocument();
    expect(screen.queryByText(COULDNT_READ)).toBeNull();
    expect(proposeButton()).toHaveAttribute("aria-disabled", "true");
    expect(textBox()).not.toHaveAttribute("readonly");

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByText(OFFLINE)).toBeNull();
    expectEnabled(proposeButton());
    await user.click(proposeButton());
    await waitFor(() => expect(propose).toHaveBeenCalledTimes(2));
  });
});

describe("errors and Retry (AC-4, Block 3)", () => {
  it.each([
    ["upstream", 502],
    ["unreadable", 502],
    ["bad_request", 400],
    ["unknown", 500],
  ] as const)(
    'an error (%s) shows the alert "Couldn\'t read that. Try pasting the text instead." with Retry',
    async (code, http) => {
      const { user } = renderCapture({
        propose: vi.fn<typeof proposeEvent>(async () => ({
          status: "error",
          code,
          http,
        })),
      });
      await user.type(textBox(), "Dinner 3 Nov");
      await user.click(proposeButton());
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(COULDNT_READ);
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
      expect(screen.queryByText(WORKING)).toBeNull();
      expect(textBox()).not.toHaveAttribute("readonly");
    },
  );

  it("Retry re-sends the same text, and a success then navigates", async () => {
    const propose = vi.fn<typeof proposeEvent>();
    propose.mockResolvedValueOnce({
      status: "error",
      code: "upstream",
      http: 502,
    });
    propose.mockResolvedValueOnce(OK);
    const { user, router } = renderCapture({ propose });
    await user.type(textBox(), "Dinner 3 Nov");
    await user.click(proposeButton());
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    await screen.findByRole("heading", { name: "Confirm stand-in" });
    expect(propose).toHaveBeenCalledTimes(2);
    expect(propose.mock.calls[1]?.[0]).toStrictEqual(
      propose.mock.calls[0]?.[0],
    );
    expect(propose.mock.calls[1]?.[0]).toStrictEqual({ text: "Dinner 3 Nov" });
    expect(router.state.location.pathname).toBe("/capture/confirm");
  });

  it("Retry re-sends the same image", async () => {
    const propose = vi.fn<typeof proposeEvent>();
    propose.mockResolvedValueOnce({
      status: "error",
      code: "unreadable",
      http: 502,
    });
    propose.mockResolvedValueOnce(OK);
    const { user } = renderCapture({ propose });
    await user.upload(fileInput(), png());
    await user.click(proposeButton());
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    await waitFor(() => expect(propose).toHaveBeenCalledTimes(2));
    expect(propose.mock.calls[1]?.[0]).toStrictEqual({
      image: DOWNSCALED.base64,
      mime: "image/jpeg",
    });
  });

  it("Retry clears the alert while the new request runs", async () => {
    const pending = deferred<CaptureOutcome>();
    const propose = vi.fn<typeof proposeEvent>();
    propose.mockResolvedValueOnce({
      status: "error",
      code: "upstream",
      http: 502,
    });
    propose.mockReturnValueOnce(pending.promise);
    const { user } = renderCapture({ propose });
    await user.type(textBox(), "Dinner 3 Nov");
    await user.click(proposeButton());
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText(WORKING)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it('a screenshot still too large after shrinking shows "That screenshot is too large, even after shrinking it. Try cropping it." and sends nothing', async () => {
    const { user, propose } = renderCapture({
      downscale: vi.fn<typeof downscaleImage>(async () => ({
        status: "too_large",
      })),
    });
    await user.upload(fileInput(), png());
    await user.click(proposeButton());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(TOO_LARGE);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(propose).not.toHaveBeenCalled();
  });

  it('an image the downscaler cannot read shows "Couldn\'t read that. Try pasting the text instead." and sends nothing', async () => {
    const { user, propose } = renderCapture({
      downscale: vi.fn<typeof downscaleImage>(async () => ({
        status: "unsupported",
      })),
    });
    await user.upload(
      fileInput(),
      new File(["gif"], "anim.gif", { type: "image/gif" }),
    );
    await user.click(proposeButton());
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(COULDNT_READ);
    expect(alert).not.toHaveTextContent(/gemini|google|model|api/i);
    expect(propose).not.toHaveBeenCalled();
  });
});

describe("the Paste button (PO decision 7, Block 3)", () => {
  function stubClipboard(value: unknown): void {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value,
    });
  }

  it("appends the clipboard's text to the paste box", async () => {
    const { user } = renderCapture();
    stubClipboard({ readText: vi.fn(async () => "3 Nov 19:30") });
    await user.type(textBox(), "Dinner ");
    await user.click(screen.getByRole("button", { name: "Paste" }));
    await waitFor(() => expect(textBox()).toHaveValue("Dinner 3 Nov 19:30"));
    expectEnabled(proposeButton());
  });

  it("with no clipboard API, focuses the paste box instead", async () => {
    const { user } = renderCapture();
    stubClipboard(undefined);
    const paste = screen.getByRole("button", { name: "Paste" });
    expect(paste).toHaveAttribute("type", "button");
    await user.click(paste);
    await waitFor(() => expect(textBox()).toHaveFocus());
    expect(textBox()).toHaveValue("");
  });

  it("when reading the clipboard is refused, focuses the paste box and leaves the text alone", async () => {
    const { user } = renderCapture();
    stubClipboard({
      readText: vi.fn(async () => {
        throw new DOMException("denied", "NotAllowedError");
      }),
    });
    await user.type(textBox(), "Dinner");
    await user.click(screen.getByRole("button", { name: "Paste" }));
    await waitFor(() => expect(textBox()).toHaveFocus());
    expect(textBox()).toHaveValue("Dinner");
  });
});

// CAL-022 Contract, Block 5 (AC-4; components.md "Capture screen", loading
// state; voice.md "Reading what you shared…"). Opened at /capture?from=share
// the page takes the one entry from the share inbox - the `inbox` prop, a
// vi.fn `take` settled by hand - showing a status line until it is read, then
// the normal page prefilled. The inbox emptying itself is `take`'s job
// (src/pwa/inbox.test.ts); here the page must call it exactly once.
describe("opened from a share (CAL-022 AC-4, Block 5)", () => {
  const READING = "Reading what you shared…";
  const SHARE_URL = "/capture?from=share";
  const SHOT_BYTES = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2];

  const textEntry = (
    text = "Table for two\n\nLupa, 3 Nov 19:30",
  ): ShareEntry => ({
    text,
    image: null,
    receivedAt: "2026-10-27T09:15:00.000Z",
  });
  const imageEntry = (text = ""): ShareEntry => ({
    text,
    image: {
      bytes: new Uint8Array(SHOT_BYTES).buffer as ArrayBuffer,
      mime: "image/png",
      name: "Screenshot_20261027.png",
    },
    receivedAt: "2026-10-27T09:16:00.000Z",
  });

  /** A take() the test settles by hand. */
  function pendingTake() {
    const read = deferred<ShareEntry | null>();
    const take: Take = vi.fn(() => read.promise);
    return { take, read };
  }

  it('while the entry is read: the heading, one status line "Reading what you shared…", no paste box, no picker, and Propose aria-disabled', async () => {
    const { take } = pendingTake();
    const { user, propose } = renderCapture({
      at: SHARE_URL,
      inbox: { take },
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      /^Capture$/,
    );
    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent(/^Reading what you shared…$/);
    expect(
      screen.queryByRole("textbox", { name: "Booking email or text" }),
    ).toBeNull();
    expect(screen.queryByLabelText("Choose a screenshot")).toBeNull();
    expect(proposeButton()).toHaveAttribute("aria-disabled", "true");
    await user.click(proposeButton());
    await settle();
    expect(propose).not.toHaveBeenCalled();
  });

  it("the status line comes after the heading and before Propose", () => {
    const { take } = pendingTake();
    renderCapture({ at: SHARE_URL, inbox: { take } });
    const order = [
      screen.getByRole("heading", { level: 1 }),
      screen.getByText(READING),
      proposeButton(),
    ];
    for (let i = 1; i < order.length; i += 1) {
      const before = order[i - 1] as HTMLElement;
      const after = order[i] as HTMLElement;
      expect(
        before.compareDocumentPosition(after) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  it("a shared text: once read, the status line goes and the paste box holds the text, with Propose enabled", async () => {
    const { take, read } = pendingTake();
    renderCapture({ at: SHARE_URL, inbox: { take } });
    expect(screen.getByText(READING)).toBeInTheDocument();
    await act(async () => read.resolve(textEntry()));
    await settle();
    expect(screen.queryByText(READING)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(textBox()).toHaveValue("Table for two\n\nLupa, 3 Nov 19:30");
    expect(screen.queryByRole("img")).toBeNull();
    expectEnabled(proposeButton());
  });

  it('a shared image: once read, the thumbnail <img alt="Screenshot preview"> and "Remove screenshot" show, the paste box is empty, Propose is enabled', async () => {
    const { take, read } = pendingTake();
    renderCapture({ at: SHARE_URL, inbox: { take } });
    await act(async () => read.resolve(imageEntry()));
    const thumb = await screen.findByRole("img", {
      name: "Screenshot preview",
    });
    expect(thumb.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    expect(
      screen.getByRole("button", { name: "Remove screenshot" }),
    ).toBeInTheDocument();
    expect(textBox()).toHaveValue("");
    expect(screen.queryByText(READING)).toBeNull();
    expect(screen.queryByText(ONLY_IMAGE)).toBeNull();
    expectEnabled(proposeButton());
  });

  it('a shared text and image: both are prefilled and "Only the screenshot will be sent." shows', async () => {
    const take: Take = vi.fn(async () => imageEntry("Lupa, 3 Nov"));
    renderCapture({ at: SHARE_URL, inbox: { take } });
    await screen.findByRole("img", { name: "Screenshot preview" });
    expect(textBox()).toHaveValue("Lupa, 3 Nov");
    expect(screen.getByText(ONLY_IMAGE)).toBeInTheDocument();
    expectEnabled(proposeButton());
  });

  it("an empty inbox (take resolves null): the normal empty capture page, Propose disabled, no status line", async () => {
    const take: Take = vi.fn(async () => null);
    renderCapture({ at: SHARE_URL, inbox: { take } });
    await waitFor(() => expect(take).toHaveBeenCalledTimes(1));
    await settle();
    expect(screen.queryByText(READING)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
    expect(textBox()).toHaveValue("");
    expect(fileInput()).toHaveAttribute("type", "file");
    expect(proposeButton()).toHaveAttribute("aria-disabled", "true");
  });

  it("an inbox that cannot be read (take rejects): the normal empty capture page, and no alert", async () => {
    const take: Take = vi.fn(async () => {
      throw new DOMException("IndexedDB unavailable", "UnknownError");
    });
    renderCapture({ at: SHARE_URL, inbox: { take } });
    await waitFor(() => expect(take).toHaveBeenCalledTimes(1));
    await settle();
    expect(screen.queryByText(READING)).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(textBox()).toHaveValue("");
    expect(proposeButton()).toHaveAttribute("aria-disabled", "true");
  });

  it("take is called exactly once per mount, however often the page re-renders", async () => {
    const { take, read } = pendingTake();
    const { user } = renderCapture({ at: SHARE_URL, inbox: { take } });
    await act(async () => read.resolve(textEntry("Dinner")));
    await settle();
    await user.type(textBox(), " at 8");
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await settle();
    expect(textBox()).toHaveValue("Dinner at 8");
    expect(take).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["/capture", "no query"],
    ["/capture?from=elsewhere", "another from value"],
    ["/capture?share=1", "a different parameter"],
  ])(
    "opened at %s (%s): take is never called and the empty page renders at once",
    async (at) => {
      const take: Take = vi.fn(async () => textEntry());
      renderCapture({ at, inbox: { take } });
      expect(screen.queryByRole("status")).toBeNull();
      expect(textBox()).toHaveValue("");
      await settle();
      expect(take).not.toHaveBeenCalled();
      expect(textBox()).toHaveValue("");
    },
  );

  it("the URL keeps ?from=share after the read (PO decision 3)", async () => {
    const take: Take = vi.fn(async () => textEntry());
    const { router } = renderCapture({ at: SHARE_URL, inbox: { take } });
    await waitFor(() => expect(textBox()).toHaveValue(textEntry().text));
    expect(router.state.location.pathname).toBe("/capture");
    expect(router.state.location.search).toBe("?from=share");
  });

  it("proposing a shared text sends {text} exactly as shared", async () => {
    const take: Take = vi.fn(async () => textEntry());
    const { user, propose, downscale } = renderCapture({
      at: SHARE_URL,
      inbox: { take },
    });
    await waitFor(() => expect(textBox()).toHaveValue(textEntry().text));
    await user.click(proposeButton());
    await waitFor(() => expect(propose).toHaveBeenCalledTimes(1));
    expect(propose.mock.calls[0]?.[0]).toStrictEqual({
      text: "Table for two\n\nLupa, 3 Nov 19:30",
    });
    expect(downscale).not.toHaveBeenCalled();
  });

  it("proposing a shared image goes through downscale with a File of the entry's bytes, type and name, then sends the downscaled {image, mime}", async () => {
    const take: Take = vi.fn(async () => imageEntry());
    const { user, propose, downscale } = renderCapture({
      at: SHARE_URL,
      inbox: { take },
    });
    await screen.findByRole("img", { name: "Screenshot preview" });
    await user.click(proposeButton());
    await waitFor(() => expect(propose).toHaveBeenCalledTimes(1));
    expect(downscale).toHaveBeenCalledTimes(1);
    const file = downscale.mock.calls[0]?.[0];
    expect(file).toBeInstanceOf(File);
    expect(file?.type).toBe("image/png");
    expect((file as File).name).toBe("Screenshot_20261027.png");
    const sent = new Uint8Array(await (file as File).arrayBuffer());
    expect([...sent]).toStrictEqual(SHOT_BYTES);
    expect(propose.mock.calls[0]?.[0]).toStrictEqual({
      image: DOWNSCALED.base64,
      mime: "image/jpeg",
    });
  });

  it('"Remove screenshot" on a shared image works as for a picked one: no thumbnail, Propose disabled with no text', async () => {
    const take: Take = vi.fn(async () => imageEntry());
    const { user } = renderCapture({ at: SHARE_URL, inbox: { take } });
    await user.click(
      await screen.findByRole("button", { name: "Remove screenshot" }),
    );
    expect(
      screen.queryByRole("img", { name: "Screenshot preview" }),
    ).toBeNull();
    expect(proposeButton()).toHaveAttribute("aria-disabled", "true");
  });
});
