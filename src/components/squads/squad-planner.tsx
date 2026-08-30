import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import * as api from "@/features/squads/api";
import {
  useCurrentPlayer,
  useMyRole,
  useSquadEvents,
} from "@/features/squads/hooks";
import { GAME_TYPES } from "@/constants/game-types";
import { gameLabel } from "./squad-ui";
import type {
  RsvpStatus,
  SquadEvent,
  GameType,
  Squad,
} from "@/features/squads/api";
import {
  CalendarPlus,
  CalendarClock,
  Check,
  HelpCircle,
  Loader2,
  Trash2,
  X,
  Clock3,
  Users,
  Trophy,
  Swords,
  Dumbbell,
  ChevronRight,
} from "lucide-react";
import {
  addDays,
  format,
  formatDistanceToNow,
  isSameDay,
  isToday,
  isTomorrow,
  isPast,
  startOfDay,
} from "date-fns";
import { toast } from "sonner";

const TYPES = [
  {
    id: "tournament",
    label: "Tournament",
    icon: Trophy,
  },
  {
    id: "scrim",
    label: "Scrim",
    icon: Swords,
  },
  {
    id: "practice",
    label: "Practice",
    icon: Dumbbell,
  },
] as const;

type PlanningFilter = "upcoming" | "all" | "past";

function getEventType(type: string) {
  return TYPES.find((item) => item.id === type) ?? TYPES[0];
}

function getDayLabel(date: Date) {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEEE");
}

function getDateGroupLabel(date: Date) {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";

  const tomorrow = addDays(startOfDay(new Date()), 1);
  const weekEnd = addDays(tomorrow, 6);

  if (date >= tomorrow && date <= weekEnd) {
    return format(date, "EEEE, MMM d");
  }

  return format(date, "EEEE, MMM d");
}

function EventCard({
  event,
  me,
  isOfficer,
  onRsvp,
  onDelete,
}: {
  event: SquadEvent;
  me: ReturnType<typeof useCurrentPlayer>;
  isOfficer: boolean;
  onRsvp: (event: SquadEvent, status: RsvpStatus) => Promise<void>;
  onDelete: (event: SquadEvent) => Promise<void>;
}) {
  const eventDate = new Date(event.startsAt ?? Date.now());
  const past = isPast(eventDate);

  const counts: Record<RsvpStatus, number> = {
    in: 0,
    maybe: 0,
    out: 0,
  };

  Object.values(event.rsvps ?? {}).forEach((value) => {
    if (value in counts) {
      counts[value as RsvpStatus] += 1;
    }
  });

  const mine = me ? event.rsvps?.[me.userId] : undefined;
  const eventType = getEventType(event.type);
  const TypeIcon = eventType.icon;

  const rsvpOptions: {
    id: RsvpStatus;
    label: string;
    icon: typeof Check;
  }[] = [
    {
      id: "in",
      label: "I'm in",
      icon: Check,
    },
    {
      id: "maybe",
      label: "Maybe",
      icon: HelpCircle,
    },
    {
      id: "out",
      label: "Can't",
      icon: X,
    },
  ];

  return (
    <article
      className={cn(
        "group overflow-hidden rounded-2xl border border-border/50 bg-card transition-all",
        "hover:border-primary/25 hover:bg-card/90",
        past && "opacity-65",
      )}
    >
      <div className="flex flex-col sm:flex-row">
        <div className="flex shrink-0 items-center gap-3 border-b border-border/40 bg-primary/[0.045] px-4 py-3 sm:w-[118px] sm:flex-col sm:justify-center sm:border-b-0 sm:border-r sm:px-3 sm:py-4">
          <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-center sm:w-full">
            <div className="font-display text-2xl font-black leading-none text-primary">
              {format(eventDate, "dd")}
            </div>

            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              {format(eventDate, "MMM")}
            </div>
          </div>

          <div className="min-w-0 sm:text-center">
            <p className="truncate text-xs font-semibold sm:hidden">
              {getDayLabel(eventDate)}
            </p>

            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {format(eventDate, "yyyy")}
            </p>
          </div>
        </div>

        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="hidden shrink-0 rounded-xl border border-border/50 bg-secondary/40 p-2.5 sm:block">
              <TypeIcon className="h-4 w-4 text-primary" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start gap-2">
                <h4 className="min-w-0 flex-1 break-words font-display text-sm font-bold sm:text-base">
                  {event.title}
                </h4>

                <span className="shrink-0 rounded-full bg-secondary/60 px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                  {eventType.label}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                  {format(eventDate, "EEE, d MMM")}
                </span>

                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="h-3.5 w-3.5 shrink-0" />
                  {format(eventDate, "HH:mm")}
                </span>

                <span className="font-medium text-foreground/70">
                  {gameLabel(event.game)}
                </span>
              </div>

              <div className="mt-2">
                <span
                  className={cn(
                    "text-[11px] font-semibold",
                    past ? "text-muted-foreground" : "text-primary",
                  )}
                >
                  {past
                    ? "Completed"
                    : formatDistanceToNow(eventDate, {
                        addSuffix: true,
                      })}
                </span>
              </div>

              {event.notes && (
                <div className="mt-3 rounded-xl border border-border/40 bg-secondary/20 px-3 py-2.5">
                  <p className="break-words text-xs leading-relaxed text-foreground/70">
                    {event.notes}
                  </p>
                </div>
              )}

              <div className="mt-4 flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {rsvpOptions.map((option) => {
                    const Icon = option.icon;
                    const selected = mine === option.id;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        disabled={!me || past}
                        onClick={() => void onRsvp(event, option.id)}
                        className={cn(
                          "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all",
                          "disabled:cursor-not-allowed disabled:opacity-40",
                          selected
                            ? "border-primary/50 bg-primary/15 text-primary shadow-sm"
                            : "border-border/50 bg-background/30 text-muted-foreground hover:border-primary/30 hover:bg-primary/[0.06] hover:text-foreground",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {counts.in} confirmed
                  </span>

                  <span>{counts.maybe} maybe</span>

                  <span>{counts.out} unavailable</span>

                  {(isOfficer || me?.userId === event.createdBy) && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Delete ${event.title}`}
                      className="ml-auto h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => void onDelete(event)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export function SquadPlanner({ squad }: { squad: Squad }) {
  const me = useCurrentPlayer();
  const { isOfficer } = useMyRole(squad);
  const { data: events = [], refetch } = useSquadEvents(squad.id);

  const [saving, setSaving] = useState(false);
  const [rsvpLoading, setRsvpLoading] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [game, setGame] = useState<GameType>(
    (squad.game as GameType) ?? GAME_TYPES[0].id,
  );
  const [type, setType] = useState("tournament");
  const [startsAt, setStartsAt] = useState("");
  const [notes, setNotes] = useState("");

  const [filter, setFilter] =
    useState<PlanningFilter>("upcoming");

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      return (
        new Date(a.startsAt ?? 0).getTime() -
        new Date(b.startsAt ?? 0).getTime()
      );
    });
  }, [events]);

  const upcomingEvents = useMemo(() => {
    return sortedEvents.filter((event) => {
      return !isPast(new Date(event.startsAt ?? Date.now()));
    });
  }, [sortedEvents]);

  const pastEvents = useMemo(() => {
    return sortedEvents
      .filter((event) => {
        return isPast(new Date(event.startsAt ?? Date.now()));
      })
      .reverse();
  }, [sortedEvents]);

  const visibleEvents = useMemo(() => {
    if (filter === "past") {
      return pastEvents;
    }

    if (filter === "all") {
      return sortedEvents;
    }

    return upcomingEvents;
  }, [filter, pastEvents, sortedEvents, upcomingEvents]);

  const nextEvent = upcomingEvents[0];

  const confirmedForNext = nextEvent
    ? Object.values(nextEvent.rsvps ?? {}).filter(
        (value) => value === "in",
      ).length
    : 0;

  const todayEvents = sortedEvents.filter((event) => {
    return isToday(new Date(event.startsAt ?? Date.now()));
  });

  const create = async () => {
    if (!me) {
      toast.error("Sign in to plan sessions");
      return;
    }

    if (title.trim().length < 3) {
      toast.error("Give the session a title");
      return;
    }

    if (!startsAt) {
      toast.error("Pick a date and time");
      return;
    }

    const selectedDate = new Date(startsAt);

    if (Number.isNaN(selectedDate.getTime())) {
      toast.error("Choose a valid date and time");
      return;
    }

    if (selectedDate.getTime() <= Date.now()) {
      toast.error("Choose a future date and time");
      return;
    }

    setSaving(true);

    try {
      await api.addEvent(squad.id, {
        title: title.trim(),
        game,
        type,
        startsAt,
        notes: notes.trim(),
        createdBy: me.userId,
      });

      await refetch();

      toast.success("Session added to the squad calendar");

      setTitle("");
      setNotes("");
      setStartsAt("");
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not add the session";

      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleRsvp = async (
    event: SquadEvent,
    status: RsvpStatus,
  ): Promise<void> => {
    if (!me) {
      toast.error("Sign in to respond");
      return;
    }

    setRsvpLoading(event.id);

    try {
      await api.rsvp(event.id, me.userId, status);
      await refetch();
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not update your RSVP";

      toast.error(message);
    } finally {
      setRsvpLoading(null);
    }
  };

  const handleDelete = async (
    event: SquadEvent,
  ): Promise<void> => {
    setDeleteLoading(event.id);

    try {
      await api.removeEvent(event.id);
      await refetch();
      toast.success("Session deleted");
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not delete the session";

      toast.error(message);
    } finally {
      setDeleteLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-border/50 bg-card p-3 sm:p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <CalendarClock className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Upcoming
            </span>
          </div>

          <p className="mt-2 font-display text-xl font-black sm:text-2xl">
            {upcomingEvents.length}
          </p>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-3 sm:p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock3 className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Today
            </span>
          </div>

          <p className="mt-2 font-display text-xl font-black sm:text-2xl">
            {todayEvents.length}
          </p>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-3 sm:p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Next RSVPs
            </span>
          </div>

          <p className="mt-2 font-display text-xl font-black sm:text-2xl">
            {confirmedForNext}
          </p>
        </div>

        <div className="rounded-2xl border border-border/50 bg-card p-3 sm:p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Trophy className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              Total
            </span>
          </div>

          <p className="mt-2 font-display text-xl font-black sm:text-2xl">
            {events.length}
          </p>
        </div>
      </div>

      {nextEvent && (
        <div className="overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.06]">
          <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="shrink-0 rounded-xl border border-primary/25 bg-primary/10 p-2.5">
                <CalendarClock className="h-5 w-5 text-primary" />
              </div>

              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                  Next session
                </p>

                <p className="mt-0.5 truncate font-display text-sm font-bold sm:text-base">
                  {nextEvent.title}
                </p>

                <p className="mt-1 text-xs text-muted-foreground">
                  {gameLabel(nextEvent.game)} ·{" "}
                  {format(
                    new Date(
                      nextEvent.startsAt ?? Date.now(),
                    ),
                    "EEE, d MMM · HH:mm",
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <div className="text-left sm:text-right">
                <p className="text-xs font-bold text-primary">
                  {confirmedForNext} confirmed
                </p>

                <p className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(
                    new Date(
                      nextEvent.startsAt ?? Date.now(),
                    ),
                    {
                      addSuffix: true,
                    },
                  )}
                </p>
              </div>

              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-display text-base font-bold">
                Squad schedule
              </h3>

              <p className="mt-0.5 text-xs text-muted-foreground">
                Coordinate tournaments, scrims and practice sessions.
              </p>
            </div>

            <div className="grid grid-cols-3 rounded-xl border border-border/50 bg-card p-1 sm:flex">
              {(
                [
                  ["upcoming", "Upcoming"],
                  ["all", "All"],
                  ["past", "Past"],
                ] as [PlanningFilter, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={cn(
                    "rounded-lg px-2.5 py-2 text-[10px] font-bold transition-colors sm:px-3",
                    filter === value
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {visibleEvents.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border/60 bg-card/30 p-8 text-center sm:p-12">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                <CalendarClock className="h-7 w-7 text-primary" />
              </div>

              <p className="font-display font-bold">
                {filter === "past"
                  ? "No completed sessions"
                  : filter === "all"
                    ? "No sessions planned yet"
                    : "Nothing scheduled"}
              </p>

              <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
                {filter === "past"
                  ? "Completed squad sessions will appear here."
                  : "Schedule your next tournament, scrim or practice block and collect RSVPs from the squad."}
              </p>
            </div>
          )}

          {visibleEvents.length > 0 && (
            <div className="space-y-3">
              {visibleEvents.map((event, index) => {
                const eventDate = new Date(
                  event.startsAt ?? Date.now(),
                );

                const previousEvent =
                  index > 0
                    ? visibleEvents[index - 1]
                    : undefined;

                const previousDate = previousEvent
                  ? new Date(
                      previousEvent.startsAt ?? Date.now(),
                    )
                  : null;

                const showDateHeader =
                  !previousDate ||
                  !isSameDay(eventDate, previousDate);

                return (
                  <div
                    key={event.id}
                    className="space-y-2"
                  >
                    {showDateHeader && (
                      <div className="flex items-center gap-2 px-1 pt-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                          {getDateGroupLabel(eventDate)}
                        </span>

                        <div className="h-px flex-1 bg-border/40" />
                      </div>
                    )}

                    <div className="relative">
                      {rsvpLoading === event.id && (
                        <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-full border border-border/50 bg-background/90 p-1.5 shadow-sm">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                        </div>
                      )}

                      {deleteLoading === event.id ? (
                        <div className="flex items-center justify-center rounded-2xl border border-border/50 bg-card p-8">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        </div>
                      ) : (
                        <EventCard
                          event={event}
                          me={me}
                          isOfficer={isOfficer}
                          onRsvp={handleRsvp}
                          onDelete={handleDelete}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <aside className="min-w-0 xl:sticky xl:top-24">
          <div className="overflow-hidden rounded-2xl border border-border/50 bg-card">
            <div className="border-b border-border/40 bg-primary/[0.04] p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-primary/25 bg-primary/10 p-2.5">
                  <CalendarPlus className="h-4 w-4 text-primary" />
                </div>

                <div>
                  <h3 className="font-display text-sm font-bold uppercase tracking-wider">
                    Plan a session
                  </h3>

                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Add an activity to the squad calendar.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 p-4 sm:p-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Session title
                </label>

                <Input
                  value={title}
                  onChange={(event) =>
                    setTitle(event.target.value)
                  }
                  placeholder="Friday cash cup"
                  maxLength={60}
                  className="h-10"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Type
                  </label>

                  <Select
                    value={type}
                    onValueChange={setType}
                  >
                    <SelectTrigger className="h-10 min-w-0">
                      <SelectValue placeholder="Session type" />
                    </SelectTrigger>

                    <SelectContent>
                      {TYPES.map((item) => (
                        <SelectItem
                          key={item.id}
                          value={item.id}
                        >
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Game
                  </label>

                  <Select
                    value={game}
                    onValueChange={(value) =>
                      setGame(value as GameType)
                    }
                  >
                    <SelectTrigger className="h-10 min-w-0">
                      <SelectValue placeholder="Game" />
                    </SelectTrigger>

                    <SelectContent>
                      {GAME_TYPES.map((item) => (
                        <SelectItem
                          key={item.id}
                          value={item.id}
                        >
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Date &amp; time
                </label>

                <Input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) =>
                    setStartsAt(event.target.value)
                  }
                  className="h-10 min-w-0"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Notes
                </label>

                <Textarea
                  value={notes}
                  onChange={(event) =>
                    setNotes(event.target.value)
                  }
                  placeholder="Lobby code, roles, warm-up plan…"
                  rows={4}
                  maxLength={280}
                  className="resize-none"
                />

                <div className="text-right text-[10px] text-muted-foreground">
                  {notes.length}/280
                </div>
              </div>

              <Button
                className="h-11 w-full gap-2"
                onClick={() => void create()}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CalendarPlus className="h-4 w-4" />
                )}

                {saving
                  ? "Adding session…"
                  : "Add to calendar"}
              </Button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}