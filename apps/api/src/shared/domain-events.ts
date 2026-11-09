import { EventEmitter } from "node:events";

export type CampusHubEvent =
  | {
      type: "assignment.created";
      sectionId: string;
      assignmentId: string;
      title: string;
    }
  | {
      type: "assignment.graded";
      studentId: string;
      assignmentId: string;
      title: string;
    }
  | {
      type: "attendance.opened";
      sectionId: string;
      sessionId: string;
      title: string;
    }
  | {
      type: "announcement.created";
      sectionId: string | null;
      announcementId: string;
      title: string;
      body: string;
    };

type EventHandler = (event: CampusHubEvent) => void | Promise<void>;

export class DomainEventBus extends EventEmitter {
  onCampusHubEvent(handler: EventHandler): void {
    this.on("campushub:event", handler);
  }

  async publish(event: CampusHubEvent): Promise<void> {
    const handlers = this.listeners("campushub:event") as EventHandler[];
    await Promise.all(handlers.map((handler) => handler(event)));
  }
}
