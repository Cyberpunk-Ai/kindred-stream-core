import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { backend } from "@/backend";
import {
  listBackups,
  createBackup,
  setBackupPinned,
  deleteBackup,
  getBackupDownloadUrl,
} from "@/lib/backups.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Database,
  Download,
  Shield,
  CheckCircle2,
  Clock,
  HardDrive,
  Loader2,
  Table as TableIcon,
  Trash2,
  Pin,
  PinOff,
  Play,
  AlertTriangle,
} from "lucide-react";
import { exportAsJSON, exportAsCSV, exportAsSQL, getExportFilename } from "@/utils/export";
import { toast } from "sonner";
import { format } from "date-fns";

const EXPORTABLE_TABLES = [
  { key: "profiles", label: "Users / Profiles" },
  { key: "tournaments", label: "Tournaments" },
  { key: "matches", label: "Matches" },
  { key: "payments", label: "Payments" },
  { key: "registrations", label: "Registrations" },
  { key: "user_statuses", label: "Posts / Statuses" },
  { key: "status_comments", label: "Comments" },
  { key: "marketplace_listings", label: "Marketplace Listings" },
  { key: "achievements", label: "Achievements" },
  { key: "user_achievements", label: "User Achievements" },
  { key: "notifications", label: "Notifications" },
  { key: "support_tickets", label: "Support Tickets" },
  { key: "game_rooms", label: "Game Rooms" },
  { key: "referrals", label: "Referrals" },
  { key: "rewards", label: "Rewards" },
  { key: "user_roles", label: "Roles & Permissions" },
];

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function AdminBackup() {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");
  const [includeStorage, setIncludeStorage] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const fetchBackups = useServerFn(listBackups);
  const runBackup = useServerFn(createBackup);
  const pinBackup = useServerFn(setBackupPinned);
  const removeBackup = useServerFn(deleteBackup);
  const downloadBackup = useServerFn(getBackupDownloadUrl);

  const { data: backups = [], isLoading } = useQuery({
    queryKey: ["admin-backups"],
    queryFn: () => fetchBackups(),
  });

  const { data: counts = {} } = useQuery({
    queryKey: ["admin-table-counts"],
    queryFn: async () => {
      const results = await Promise.all(
        EXPORTABLE_TABLES.map(async (t) => {
          const { count } = await backend
            .from(t.key as any)
            .select("*", { count: "exact", head: true });
          return [t.key, count ?? 0];
        }),
      );
      return Object.fromEntries(results);
    },
  });

  const createMutation = useMutation({
    mutationFn: () => runBackup({ data: { label, includeStorage } }),
    onSuccess: (res: { removed?: number } | undefined) => {
      setLabel("");
      toast.success(
        res?.removed
          ? `Snapshot created. ${res.removed} old snapshot(s) rotated out.`
          : "Snapshot created.",
      );
      queryClient.invalidateQueries({ queryKey: ["admin-backups"] });
    },
    onError: (err: Error) => toast.error("Backup failed: " + err.message),
  });

  const pinMutation = useMutation({
    mutationFn: (vars: { id: string; pinned: boolean }) => pinBackup({ data: vars }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-backups"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeBackup({ data: { id } }),
    onSuccess: () => {
      toast.success("Snapshot deleted");
      queryClient.invalidateQueries({ queryKey: ["admin-backups"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleDownload = async (id: string) => {
    try {
      const { url } = await downloadBackup({ data: { id } });
      window.open(url, "_blank", "noopener");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    }
  };

  const handleExport = async (table: string, formatType: "json" | "csv" | "sql") => {
    setExporting(table + formatType);
    try {
      const { data, error } = await backend.from(table as any).select("*");
      if (error) throw error;
      const filename = getExportFilename(table, formatType);
      if (formatType === "json") exportAsJSON(data, filename);
      else if (formatType === "csv") exportAsCSV(data ?? [], filename);
      else exportAsSQL(table, data ?? [], filename);
      toast.success(`Exported ${data?.length ?? 0} rows from ${table}`);
    } catch (err) {
      toast.error("Export failed: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setExporting(null);
    }
  };

  const totalRows = Object.values(counts as Record<string, number>).reduce((a, b) => a + b, 0);
  const retained = backups.filter((b) => !b.pinned && b.status === "completed").length;
  const latest = backups.find((b) => b.status === "completed");

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6 text-primary" /> Backups & Snapshots
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Server-side snapshots of the database and storage files. The three most recent unpinned
            snapshots are kept automatically.
          </p>
        </div>
        {latest && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> Last snapshot:{" "}
            {format(new Date(latest.created_at), "MMM d, HH:mm")}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-primary shrink-0" />
            <div>
              <div className="font-bold text-lg">{totalRows.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Database records</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <TableIcon className="h-8 w-8 text-primary shrink-0" />
            <div>
              <div className="font-bold text-lg">{EXPORTABLE_TABLES.length}</div>
              <div className="text-xs text-muted-foreground">Monitored tables</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary shrink-0" />
            <div>
              <div className="font-bold text-lg">{retained} / 3</div>
              <div className="text-xs text-muted-foreground">Rotating snapshots</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <HardDrive className="h-8 w-8 text-primary shrink-0" />
            <div>
              <div className="font-bold text-lg">{backups.length}</div>
              <div className="text-xs text-muted-foreground">Stored snapshots</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">Create a snapshot</CardTitle>
          <CardDescription>
            Captures every table plus storage files into private backup storage. Creating a new
            snapshot automatically removes the oldest unpinned one once three are stored.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row md:items-center gap-3">
          <Input
            placeholder="Snapshot label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="md:max-w-xs"
          />
          <div className="flex items-center gap-2">
            <Switch
              id="include-storage"
              checked={includeStorage}
              onCheckedChange={setIncludeStorage}
            />
            <Label htmlFor="include-storage" className="text-sm">
              Include storage files
            </Label>
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="md:ml-auto"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Run backup now
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Snapshot history</CardTitle>
          <CardDescription>
            Pin a snapshot to keep it beyond the three-snapshot rotation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading snapshots…
            </div>
          ) : backups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No snapshots yet. Run your first backup above.
            </p>
          ) : (
            <div className="space-y-2">
              {backups.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-secondary/30"
                >
                  <div>
                    <div className="font-medium text-sm flex items-center gap-2">
                      {b.label}
                      {b.pinned && <Badge>Pinned</Badge>}
                      {b.status !== "completed" && (
                        <Badge variant="secondary" className="capitalize">
                          {b.status}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(b.created_at), "PPpp")} · {formatBytes(b.size_bytes)} ·{" "}
                      {Object.values((b.table_counts ?? {}) as Record<string, number>).reduce(
                        (a: number, c: number) => a + c,
                        0,
                      )}{" "}
                      rows
                      {b.includes_storage ? ` · ${b.storage_file_count} files` : ""}
                    </div>
                    {b.error && (
                      <div className="text-xs text-destructive flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3" /> {b.error}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => pinMutation.mutate({ id: b.id, pinned: !b.pinned })}
                    >
                      {b.pinned ? (
                        <PinOff className="h-3.5 w-3.5 mr-1" />
                      ) : (
                        <Pin className="h-3.5 w-3.5 mr-1" />
                      )}
                      {b.pinned ? "Unpin" : "Keep"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={b.status !== "completed"}
                      onClick={() => handleDownload(b.id)}
                    >
                      <Download className="h-3.5 w-3.5 mr-1" /> Download
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(b.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export individual tables</CardTitle>
          <CardDescription>Download a single table as JSON, CSV or SQL.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border/40">
            {EXPORTABLE_TABLES.map((t) => (
              <div key={t.key} className="flex items-center justify-between py-2.5 gap-3">
                <div className="text-sm">
                  <div className="font-medium">{t.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {(counts as any)[t.key]?.toLocaleString() ?? 0} rows
                  </div>
                </div>
                <div className="flex gap-1">
                  {(["json", "csv", "sql"] as const).map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant="outline"
                      disabled={exporting === t.key + f}
                      onClick={() => handleExport(t.key, f)}
                    >
                      {exporting === t.key + f ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        f.toUpperCase()
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
