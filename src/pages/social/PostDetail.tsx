import { Link, useParams } from "@/lib/router-compat";
import { ArrowLeft } from "lucide-react";
import { SocialLayout } from "@/components/social/social-nav";
import { StatusFeed } from "@/components/status/status-feed";
import { SuggestionsRail } from "@/components/social/suggestions-rail";

/**
 * A shared post link opens the real feed, with the linked post pinned to the
 * top. Every card behaviour (gradient text cards, likes, comments, galleries,
 * saves, sharing) is the feed's own, so there is no second half-finished post
 * renderer to keep in sync.
 */
export default function PostDetail() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  return (
    <SocialLayout rightRail={<SuggestionsRail />}>
      <div className="max-w-[470px] mx-auto w-full">
        <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-border/40 bg-background/90 px-4 py-3 backdrop-blur-xl">
          <Link
            to="/social"
            aria-label="Back to feed"
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-base font-bold">Post</h1>
        </div>

        <div className="pb-20 md:pb-8">
          <StatusFeed focusPostId={id} />
        </div>
      </div>
    </SocialLayout>
  );
}
