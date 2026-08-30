import { backend } from "@/backend";
import type { Database } from "@/backend/database";

export type NotificationRow = Database["public"]["Tables"]["notifications"]["Row"];
export type NotificationInsert = Database["public"]["Tables"]["notifications"]["Insert"];

export type NotificationPayload = {
  title: string;
  body: string;
  userId: string;
  data?: Record<string, any>;
  type?: string;
};

export interface INotificationChannel {
  send(notification: NotificationPayload): Promise<void>;
}

export class InAppNotificationChannel implements INotificationChannel {
  async send(notification: NotificationPayload): Promise<void> {
    try {
      const { error } = await backend.from("notifications").insert({
        user_id: notification.userId,
        title: notification.title,
        message: notification.body,
        type: (notification.type as any) || "system",
        is_read: false,
      } as any);

      if (error) {
        console.error("InAppNotificationChannel error:", error);
      }
    } catch (err) {
      console.error("InAppNotificationChannel catch error:", err);
    }
  }
}

export class PushNotificationChannel implements INotificationChannel {
  async send(notification: NotificationPayload): Promise<void> {
    // Stub
  }
}

export class EmailNotificationChannel implements INotificationChannel {
  async send(notification: NotificationPayload): Promise<void> {
    // Stub
  }
}

export class SMSNotificationChannel implements INotificationChannel {
  async send(notification: NotificationPayload): Promise<void> {
    // Stub
  }
}

export class NotificationService {
  private channels: Map<string, INotificationChannel> = new Map();

  constructor() {
    this.registerChannel("inapp", new InAppNotificationChannel());
  }

  registerChannel(name: string, channel: INotificationChannel): void {
    this.channels.set(name, channel);
  }

  async send(
    type: "inapp" | "push" | "email" | "sms",
    notification: NotificationPayload,
  ): Promise<void> {
    const channel = this.channels.get(type);
    if (channel) {
      await channel.send(notification);
    }
  }

  async sendToUser(
    userId: string,
    notification: Omit<NotificationPayload, "userId">,
    channels: ("inapp" | "push" | "email" | "sms")[] = ["inapp"],
  ): Promise<void> {
    const payload = { ...notification, userId };
    const promises = channels.map((ch) => this.send(ch, payload));
    await Promise.allSettled(promises);
  }

  /** Insert a notification row directly (used by pages that need bespoke titles/messages). */
  async create(notification: {
    userId: string;
    title: string;
    message: string;
    type?: NotificationInsert["type"];
    actionUrl?: string;
  }): Promise<{ error?: Error }> {
    try {
      const { error } = await backend.from("notifications").insert({
        user_id: notification.userId,
        title: notification.title,
        message: notification.message,
        type: (notification.type as any) || "system",
        action_url: notification.actionUrl,
        is_read: false,
      } as any);
      if (error) throw error;
      return {};
    } catch (err: any) {
      return { error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  async markAsRead(notificationId: string): Promise<void> {
    try {
      await backend
        .from("notifications")
        .update({ is_read: true } as any)
        .eq("id", notificationId);
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  }

  async markAllAsRead(userId: string): Promise<void> {
    try {
      await backend
        .from("notifications")
        .update({ is_read: true } as any)
        .eq("user_id", userId)
        .eq("is_read", false);
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
    }
  }

  async getNotifications(userId: string, limit: number = 60): Promise<NotificationRow[]> {
    try {
      const { data, error } = await backend
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) return [];
      return data || [];
    } catch (err) {
      return [];
    }
  }

  async getUnreadCount(userId: string): Promise<number> {
    try {
      const { count, error } = await backend
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (error) return 0;
      return count || 0;
    } catch (err) {
      return 0;
    }
  }
}

export const notificationService = new NotificationService();
