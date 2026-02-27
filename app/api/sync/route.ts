import { auth } from "@/lib/auth";
import { syncProjects } from "@/lib/services/sync";
import type { SyncProgressEvent } from "@/lib/services/sync";
import { toUserError } from "@/lib/services/error-messages";

/**
 * POST /api/sync
 * Streams sync progress via Server-Sent Events.
 * Each event is a JSON-encoded SyncProgressEvent on its own line.
 */
export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = session.user.id;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SyncProgressEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        await syncProjects(userId, send);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        send({
          type: "complete",
          result: {
            success: false,
            discovered: 0,
            imported: [],
            reconciled: [],
            orphaned: [],
            alreadyInSync: 0,
            errors: [toUserError(message)],
          },
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
