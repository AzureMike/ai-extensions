import { describe, expect, it, vi } from "vitest";
import { createSessionHolder, isLocalSessionIdle } from "./session.js";
import type { SessionPort } from "./session.js";

function sessionWithMetadata(
  metadata?: SessionPort["rpc"]["metadata"]
): SessionPort {
  return {
    send: () => undefined,
    rpc: { canvas: { open: async () => ({}) }, metadata }
  };
}

describe("local session inactivity", () => {
  it("recognizes an idle local session through the SDK RPC surface", async () => {
    const snapshot = vi.fn(async () => ({ isRemote: false }));
    const activity = vi.fn(async () => ({
      hasActiveWork: false,
      abortable: false
    }));
    expect(
      await isLocalSessionIdle(sessionWithMetadata({ snapshot, activity }))
    ).toBe(true);
    expect(snapshot).toHaveBeenCalledOnce();
    expect(activity).toHaveBeenCalledOnce();
  });

  it.each([
    { hasActiveWork: true, abortable: true },
    { hasActiveWork: true, abortable: false },
    { hasActiveWork: false, abortable: true }
  ])("does not shortcut active work: %j", async (activity) => {
    expect(
      await isLocalSessionIdle(
        sessionWithMetadata({
          snapshot: async () => ({ isRemote: false }),
          activity: async () => activity
        })
      )
    ).toBe(false);
  });

  it("does not mistake a remote session's local activity flags for idle", async () => {
    const activity = vi.fn(async () => {
      throw new Error("remote activity must not be queried");
    });
    expect(
      await isLocalSessionIdle(
        sessionWithMetadata({
          snapshot: async () => ({ isRemote: true }),
          activity
        })
      )
    ).toBe(false);
    expect(activity).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    {},
    { snapshot: async () => ({ isRemote: false }) },
    { activity: async () => ({ hasActiveWork: false, abortable: false }) }
  ])(
    "retains the grace period when metadata capability is absent",
    async (metadata) => {
      expect(await isLocalSessionIdle(sessionWithMetadata(metadata))).toBe(
        false
      );
    }
  );

  it.each([null, false, {}, { isRemote: "false" }])(
    "rejects malformed session identity: %j",
    async (snapshot) => {
      await expect(
        isLocalSessionIdle(
          sessionWithMetadata({
            snapshot: async () => snapshot,
            activity: async () => ({ hasActiveWork: false, abortable: false })
          })
        )
      ).rejects.toThrow("did not identify");
    }
  );

  it.each([
    null,
    false,
    {},
    { hasActiveWork: "false", abortable: false },
    { hasActiveWork: false },
    { hasActiveWork: false, abortable: "false" }
  ])("rejects malformed activity: %j", async (activity) => {
    await expect(
      isLocalSessionIdle(
        sessionWithMetadata({
          snapshot: async () => ({ isRemote: false }),
          activity: async () => activity
        })
      )
    ).rejects.toThrow("valid activity flags");
  });

  it.each(["snapshot", "activity"] as const)(
    "propagates %s errors for the caller to report",
    async (method) => {
      const metadata = {
        snapshot: async (): Promise<unknown> => ({ isRemote: false }),
        activity: async (): Promise<unknown> => ({
          hasActiveWork: false,
          abortable: false
        })
      };
      metadata[method] = async () => {
        throw new Error("SDK unavailable");
      };
      await expect(
        isLocalSessionIdle(sessionWithMetadata(metadata))
      ).rejects.toThrow("SDK unavailable");
    }
  );
});

describe("runtime session holder", () => {
  it("rejects access before attachment and exposes the attached session", () => {
    const holder = createSessionHolder();
    const session = {
      send: () => undefined,
      rpc: { canvas: { open: async () => ({}) } }
    };

    expect(holder.tryGet()).toBeUndefined();
    expect(() => holder.get()).toThrow(
      "Radius runtime: session accessed before attachSession() was called."
    );

    holder.set(session);
    expect(holder.tryGet()).toBe(session);
    expect(holder.get()).toBe(session);
  });
});
